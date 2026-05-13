// /api/pages — per-user catalog of HTML documents.
//
// Every row is scoped by user_id. Share tokens are opaque random strings
// stored on the row; presence of a token == "publicly viewable at
// /p/<username>/<slug>?auth=<token>". Unsharing nulls the column;
// sharing again mints a fresh token, so the old link cannot be revived.
// Edits to the html column do NOT rotate the token — share links survive
// edits.
//
// Per-user slug collisions are resolved on insert (and on title rename)
// by suffixing the slug with -2, -3, etc. — the share URL never grows a
// random suffix.

import { Hono } from 'hono'
import { db } from '../db'
import { pages, users } from '../schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { AuthVars } from '../auth'
import { MAX_HTML_BYTES, MAX_HTML_LABEL } from '../limits'

export const pageRoutes = new Hono<{ Variables: AuthVars }>()

function mintShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function publicBase(): string {
  return process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || ''
}

function buildShareUrl(username: string, slug: string, token: string): string {
  return `${publicBase()}/p/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
}

// slugify lowercases, collapses runs of non-alphanumerics into single
// hyphens, trims leading/trailing hyphens, and caps at 80 chars. Empty
// input yields "" so the caller can decide the fallback.
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

// uniqueSlugForUser finds a free slug for (user_id) starting from `base`.
// If `ignoreId` is supplied (during a rename), that row's existing slug is
// ignored so renaming a page to its own slug doesn't bump the suffix.
function uniqueSlugForUser(
  userId: number,
  base: string,
  ignoreId?: number,
): string {
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

// Strip down a page row for the catalog list — html column is large and
// not needed for the index view.
function summarizeRow(
  username: string,
  r: {
    id: number
    title: string
    slug: string
    share_token: string | null
    created_at: string | null
    updated_at: string | null
    size: number
  },
) {
  return {
    id: r.id,
    title: r.title,
    slug: r.slug,
    shared: r.share_token !== null,
    share_url: r.share_token ? buildShareUrl(username, r.slug, r.share_token) : null,
    size: r.size,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

function currentUsername(userId: number): string {
  const row = db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()
  return row?.username ?? `user${userId}`
}

pageRoutes.get('/', (c) => {
  const user = c.get('user')
  const username = currentUsername(user.id)
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
  return c.json(rows.map((r) => summarizeRow(username, r)))
})

pageRoutes.post('/', async (c) => {
  const user = c.get('user')
  let body: { title?: unknown; html?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const html = typeof body.html === 'string' ? body.html : ''
  if (!html) return c.json({ error: 'html is required' }, 400)
  if (html.length > MAX_HTML_BYTES) {
    return c.json({ error: `html too large (max ${MAX_HTML_LABEL})` }, 413)
  }
  const finalTitle = (title || extractTitle(html) || 'Untitled').slice(0, 200)
  const slug = uniqueSlugForUser(user.id, slugify(finalTitle))

  const result = db
    .insert(pages)
    .values({ user_id: user.id, title: finalTitle, slug, html })
    .run()
  const id = Number(result.lastInsertRowid)
  const row = db.select().from(pages).where(eq(pages.id, id)).get()!
  return c.json(
    summarizeRow(currentUsername(user.id), { ...row, size: row.html.length }),
    201,
  )
})

pageRoutes.get('/:id', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  const row = db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json({
    ...summarizeRow(currentUsername(user.id), { ...row, size: row.html.length }),
    html: row.html,
  })
})

// Raw HTML body for the owner — used by the catalog thumbnails. We send a
// `text/html` response so it can be the `src` of a sandboxed iframe and
// the browser handles caching. The `updated_at` query string busts the
// cache when the page changes.
pageRoutes.get('/:id/raw', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.text('bad id', 400)
  const row = db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .get()
  if (!row) return c.text('not found', 404)
  return new Response(row.html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short cache so rapid clicks between catalog and editor don't
      // re-fetch, but edits show up on a hard refresh.
      'cache-control': 'private, max-age=60',
    },
  })
})

pageRoutes.put('/:id', async (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  let body: { title?: unknown; html?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  const existing = db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .get()
  if (!existing) return c.json({ error: 'not found' }, 404)

  const updates: Record<string, unknown> = {
    updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    const newTitle = body.title.trim().slice(0, 200)
    updates.title = newTitle
    // Title rename also re-slugs. Existing share URLs for this page
    // therefore change — but the share_token stays valid, so old URLs
    // will 404 and the user has to copy the new URL from the catalog.
    // (Documented behaviour; matches what users expect from renaming.)
    updates.slug = uniqueSlugForUser(user.id, slugify(newTitle), id)
  }
  if (typeof body.html === 'string') {
    if (body.html.length > MAX_HTML_BYTES) {
      return c.json({ error: `html too large (max ${MAX_HTML_LABEL})` }, 413)
    }
    updates.html = body.html
  }
  db.update(pages).set(updates).where(eq(pages.id, id)).run()
  const row = db.select().from(pages).where(eq(pages.id, id)).get()!
  return c.json({
    ...summarizeRow(currentUsername(user.id), { ...row, size: row.html.length }),
    html: row.html,
  })
})

pageRoutes.delete('/:id', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  const res = db
    .delete(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .run()
  if (res.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// Share / unshare. Sharing always rotates the token if one already exists,
// so calling /share twice yields two different URLs and the first one
// becomes dead. That's intentional — there's no separate "rotate" verb.
pageRoutes.post('/:id/share', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  const existing = db
    .select()
    .from(pages)
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .get()
  if (!existing) return c.json({ error: 'not found' }, 404)
  const token = mintShareToken()
  db.update(pages)
    .set({
      share_token: token,
      updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
    })
    .where(eq(pages.id, id))
    .run()
  const username = currentUsername(user.id)
  return c.json({
    shared: true,
    share_url: buildShareUrl(username, existing.slug, token),
    token,
  })
})

pageRoutes.delete('/:id/share', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  const res = db
    .update(pages)
    .set({
      share_token: null,
      updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
    })
    .where(and(eq(pages.id, id), eq(pages.user_id, user.id)))
    .run()
  if (res.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json({ shared: false })
})

// Pull <title>...</title> out of the document for the catalog. Falls back
// to null when there's no title tag — caller decides the default.
function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (m && m[1].trim()) return m[1].trim()
  return null
}
