// Stateless MCP server mounted at /api/mcp.
//
// Each request rebuilds a fresh McpServer + transport bound to the calling
// user's scopes. This sidesteps the SDK's in-memory session tracking — it
// would otherwise die on every container restart, forcing Claude Desktop
// users to reconnect. We don't issue server->client notifications, so
// stateless mode loses nothing we use.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { db } from './db'
import { pages, users, customStyles } from './schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import { hasScope, type AuthUser } from './auth'
import { STYLES, findStyle } from './styles'
import { MAX_HTML_BYTES, MAX_HTML_LABEL } from './limits'

function publicBase(): string {
  return process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || ''
}

function buildShareUrl(username: string, slug: string, token: string): string {
  return `${publicBase()}/p/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
  )
}

function uniqueSlugForUser(userId: number, base: string, ignoreId?: number): string {
  const root = base || 'page'
  let candidate = root
  let n = 1
  while (true) {
    const clash = db
      .select({ id: pages.id })
      .from(pages)
      .where(and(eq(pages.user_id, userId), eq(pages.slug, candidate)))
      .get()
    if (!clash || (ignoreId && clash.id === ignoreId)) return candidate
    n += 1
    candidate = `${root}-${n}`
  }
}

function usernameFor(userId: number): string {
  const row = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()
  return row?.username ?? `user${userId}`
}

function mintShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m && m[1].trim()) return m[1].trim()
  return null
}

function requireScope(user: AuthUser, scope: 'pages:read' | 'pages:write') {
  if (!hasScope(user.scopes, scope)) {
    throw new Error(`permission denied: missing scope ${scope}`)
  }
}

function ownedRow(user: AuthUser, id: number) {
  return db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .get()
}

function summarize(
  username: string,
  row: {
    id: number
    title: string
    slug: string
    share_token: string | null
    created_at: string | null
    updated_at: string | null
    html: string
  },
) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    shared: row.share_token !== null,
    share_url: row.share_token
      ? buildShareUrl(username, row.slug, row.share_token)
      : null,
    size: row.html.length,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function buildServer(user: AuthUser): McpServer {
  const server = new McpServer({ name: 'pages', version: '2.0.0' })

  server.registerTool(
    'list_pages',
    {
      description: 'List all of your HTML pages. Returns id, title, share status, and share URL when shared.',
      inputSchema: {},
    },
    async () => {
      requireScope(user, 'pages:read')
      const username = usernameFor(user.id)
      const rows = db
        .select({
          id: pages.id,
          title: pages.title,
          slug: pages.slug,
          share_token: pages.share_token,
          created_at: pages.created_at,
          updated_at: pages.updated_at,
          size: sql<number>`length(html)`.as('size'),
        })
        .from(pages)
        .where(eq(pages.user_id, user.id))
        .orderBy(desc(pages.updated_at))
        .all()
      const out = rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        shared: r.share_token !== null,
        share_url: r.share_token ? buildShareUrl(username, r.slug, r.share_token) : null,
        size: r.size,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      }
    },
  )

  server.registerTool(
    'get_page',
    {
      description: 'Fetch a single page including its full HTML body.',
      inputSchema: { id: z.number().int().describe('Page id from list_pages') },
    },
    async ({ id }) => {
      requireScope(user, 'pages:read')
      const row = ownedRow(user, id)
      if (!row) throw new Error(`page not found: ${id}`)
      const username = usernameFor(user.id)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ...summarize(username, row), html: row.html }, null, 2),
          },
        ],
      }
    },
  )

  server.registerTool(
    'list_styles',
    {
      description:
        'Browse visual styles for new pages — both built-in curated styles AND any custom styles this user has saved on /styles. Call this BEFORE create_page when the user asks for a polished page and hasn\'t specified their own design. Each entry has `name`, `source` ("builtin" or "custom"), `summary`, `when_to_use`, plus `example_html` (rendered preview) and `starter_html` (shell to drop content into). Pass `name` to fetch only that single style. Pass `summary_only: true` to get just names + summaries (cheapest, ~200 tokens).\n\nWORKFLOW: (1) call this with summary_only=true to see what\'s available — pay attention to source="custom" entries, those are styles the USER specifically saved and likely prefers. (2) If the user named a style or the right choice is OBVIOUS from context (e.g. "make me a slide deck" → slides; "API docs page" → docs; "long essay" → editorial), pick it and proceed. (3) Otherwise — if two or more styles would plausibly fit and the user didn\'t specify — STOP and ASK the user which style they want before generating any HTML. Quote the candidate names with their `when_to_use` so they can choose. Do not guess and silently pick when the user\'s intent is ambiguous; the wrong style is worse than one extra clarifying question.',
      inputSchema: {
        name: z
          .string()
          .optional()
          .describe('Fetch just this style (e.g. "nothing", "editorial", "terminal", "notebook", "minimal", "slides", "landing", "docs", "bento", "magazine"). Omit to list all.'),
        summary_only: z
          .boolean()
          .optional()
          .describe('Return only name+summary+when_to_use for each style. Use this for a first browse, then call again with a specific `name` to get the HTML.'),
      },
    },
    async ({ name, summary_only }) => {
      // No scope check on read — the catalogue itself isn't sensitive.
      // We still scope custom_styles by the caller's user_id so an agent
      // only sees this user's own customs (not other tenants').

      // Built-ins use both `example_html` (rendered preview) and
      // `starter_html` (shell to drop content into). User-authored
      // customs collapse those into a single `html` field; we mirror it
      // into both keys when surfacing through the MCP so an agent
      // consuming the response doesn't have to special-case the source.
      type BuiltinSummary = {
        name: string
        source: 'builtin'
        summary: string
        when_to_use: string
      }
      type BuiltinFull = BuiltinSummary & {
        example_html: string
        starter_html: string
      }
      type CustomSummary = {
        name: string
        source: 'custom'
        summary: string
        when_to_use: string
      }
      type CustomFull = CustomSummary & {
        example_html: string
        starter_html: string
      }

      const builtinSummary = (s: (typeof STYLES)[number]): BuiltinSummary => ({
        name: s.name,
        source: 'builtin',
        summary: s.summary,
        when_to_use: s.when_to_use,
      })
      const builtinFull = (s: (typeof STYLES)[number]): BuiltinFull => ({
        ...builtinSummary(s),
        example_html: s.example_html,
        starter_html: s.starter_html,
      })
      const customSummary = (r: {
        name: string
        summary: string
        when_to_use: string
      }): CustomSummary => ({
        name: r.name,
        source: 'custom',
        summary: r.summary,
        when_to_use: r.when_to_use,
      })
      const customFull = (r: {
        name: string
        summary: string
        when_to_use: string
        html: string
      }): CustomFull => ({
        ...customSummary(r),
        example_html: r.html,
        starter_html: r.html,
      })

      const customsRaw = db
        .select({
          name: customStyles.name,
          summary: customStyles.summary,
          when_to_use: customStyles.when_to_use,
          html: customStyles.html,
        })
        .from(customStyles)
        .where(eq(customStyles.user_id, user.id))
        .orderBy(desc(customStyles.updated_at))
        .all()

      let out: unknown
      if (typeof name === 'string' && name.trim()) {
        const wanted = name.trim()
        const b = findStyle(wanted)
        if (b) {
          out = summary_only ? builtinSummary(b) : builtinFull(b)
        } else {
          const c2 = customsRaw.find((r) => r.name === wanted)
          if (!c2) {
            const all = [...STYLES.map((s) => s.name), ...customsRaw.map((r) => r.name)]
            throw new Error(`unknown style: ${wanted}. Available: ${all.join(', ')}`)
          }
          out = summary_only ? customSummary(c2) : customFull(c2)
        }
      } else {
        // Built-ins first, then the user's customs — gives the agent a
        // stable head of the list so prompt caching works across users.
        if (summary_only) {
          out = [
            ...STYLES.map(builtinSummary),
            ...customsRaw.map(customSummary),
          ]
        } else {
          out = [
            ...STYLES.map(builtinFull),
            ...customsRaw.map(customFull),
          ]
        }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(out, null, 2) }],
      }
    },
  )

  server.registerTool(
    'create_page',
    {
      description:
        'Create a new HTML page. Pass the full document in `html`. Title is taken from the <title> tag if not supplied. Set `share: true` to immediately mint a share link.\n\nIMPORTANT: if the user wants a styled / polished page and hasn\'t supplied their own CSS, do NOT improvise ad-hoc styling — call list_styles first and use one of the returned starter_html shells as the baseline (results are dramatically better). If the right style isn\'t obvious from the user\'s request and they didn\'t name one, ASK the user which style they want from list_styles before calling create_page. Picking the wrong style and shipping it costs more than one clarifying question.',
      inputSchema: {
        html: z.string().describe('Full HTML document'),
        title: z.string().optional(),
        share: z
          .boolean()
          .optional()
          .describe('Mint a share token at the same time so the returned page is immediately public'),
      },
    },
    async ({ html, title, share }) => {
      requireScope(user, 'pages:write')
      if (!html) throw new Error('html is required')
      if (html.length > MAX_HTML_BYTES) throw new Error(`html too large (max ${MAX_HTML_LABEL})`)
      const finalTitle = (title?.trim() || extractTitle(html) || 'Untitled').slice(0, 200)
      const slug = uniqueSlugForUser(user.id, slugify(finalTitle))
      const token = share ? mintShareToken() : null
      const result = db
        .insert(pages)
        .values({ user_id: user.id, title: finalTitle, slug, html, share_token: token })
        .run()
      const id = Number(result.lastInsertRowid)
      const row = db.select().from(pages).where(eq(pages.id, id)).get()!
      const username = usernameFor(user.id)
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(summarize(username, row), null, 2) },
        ],
      }
    },
  )

  server.registerTool(
    'update_page',
    {
      description:
        'Update a page\'s title and/or HTML. Existing share links keep working — editing does not unshare.',
      inputSchema: {
        id: z.number().int(),
        html: z.string().optional(),
        title: z.string().optional(),
      },
    },
    async ({ id, html, title }) => {
      requireScope(user, 'pages:write')
      const existing = ownedRow(user, id)
      if (!existing) throw new Error(`page not found: ${id}`)
      const updates: Record<string, unknown> = {
        updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
      }
      if (typeof title === 'string' && title.trim()) {
        const newTitle = title.trim().slice(0, 200)
        updates.title = newTitle
        updates.slug = uniqueSlugForUser(user.id, slugify(newTitle), id)
      }
      if (typeof html === 'string') {
        if (html.length > MAX_HTML_BYTES) throw new Error(`html too large (max ${MAX_HTML_LABEL})`)
        updates.html = html
      }
      db.update(pages).set(updates).where(eq(pages.id, id)).run()
      const row = db.select().from(pages).where(eq(pages.id, id)).get()!
      const username = usernameFor(user.id)
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(summarize(username, row), null, 2) },
        ],
      }
    },
  )

  server.registerTool(
    'share_page',
    {
      description:
        'Make a page publicly accessible at /p/<username>/<slug>/<token>. Returns the full share URL. Calling this on an already-shared page rotates the token, killing the old link.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      requireScope(user, 'pages:write')
      const existing = ownedRow(user, id)
      if (!existing) throw new Error(`page not found: ${id}`)
      const token = mintShareToken()
      db.update(pages)
        .set({
          share_token: token,
          updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
        })
        .where(eq(pages.id, id))
        .run()
      const username = usernameFor(user.id)
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              { id, shared: true, share_url: buildShareUrl(username, existing.slug, token) },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.registerTool(
    'unshare_page',
    {
      description: 'Revoke the share link for a page. The old URL stops working immediately. A new share_page call will mint a fresh, different token.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      requireScope(user, 'pages:write')
      const existing = ownedRow(user, id)
      if (!existing) throw new Error(`page not found: ${id}`)
      db.update(pages)
        .set({
          share_token: null,
          updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
        })
        .where(eq(pages.id, id))
        .run()
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ id, shared: false }, null, 2) },
        ],
      }
    },
  )

  server.registerTool(
    'delete_page',
    {
      description: 'Permanently delete a page. Any active share link dies with it.',
      inputSchema: { id: z.number().int() },
    },
    async ({ id }) => {
      requireScope(user, 'pages:write')
      const res = db
        .delete(pages)
        .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
        .run()
      if (res.changes === 0) throw new Error(`page not found: ${id}`)
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify({ ok: true, id }) },
        ],
      }
    },
  )

  return server
}

export async function handleMCPRequest(user: AuthUser, req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = buildServer(user)
  await server.connect(transport)
  try {
    return await transport.handleRequest(req)
  } finally {
    try {
      await transport.close()
    } catch {
      /* ignore */
    }
  }
}
