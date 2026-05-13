// /api/custom-styles — per-user style presets that show up alongside the
// curated `STYLES` from server/styles.ts.
//
// Single-document model: the user authors one HTML doc per style. We use
// it both as the visual reference (rendered in the iframe preview) AND
// as the starter shell agents drop content into. If the user includes
// the literal string `<!-- CONTENT -->` we'll respect it; otherwise the
// content gets appended before </body> when an agent creates a page
// from this style (the MCP `create_page` side handles that).
//
// Validation rules (return 400 with a useful error):
//   - name: 2-40 chars, kebab-case (lowercase + digits + hyphens)
//   - name: cannot shadow a built-in style name
//   - name: unique per user (DB enforces too)
//   - summary, when_to_use: 1-280 chars, plain text
//   - html: up to ~512KB

import { Hono } from 'hono'
import { db } from '../db'
import { customStyles } from '../schema'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { AuthVars } from '../auth'
import { findStyle, STYLES } from '../styles'
import { USER_HTML_HEADERS } from '../headers'

export const customStyleRoutes = new Hono<{ Variables: AuthVars }>()

const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const MAX_TEXT = 280
const MAX_HTML = 512 * 1024 // 512 KB
const RESERVED_BUILTIN_NAMES = new Set(STYLES.map((s) => s.name))

type Body = {
  name?: unknown
  summary?: unknown
  when_to_use?: unknown
  html?: unknown
}

function validate(body: Body, opts: { allowMissing: boolean }): string | {
  name: string
  summary: string
  when_to_use: string
  html: string
} {
  const out: Record<string, string> = {}

  if (body.name !== undefined || !opts.allowMissing) {
    if (typeof body.name !== 'string') return 'name is required'
    const name = body.name.trim().toLowerCase()
    if (!NAME_RE.test(name)) {
      return 'name must be kebab-case (a-z, 0-9, single hyphens)'
    }
    if (name.length < 2 || name.length > 40) {
      return 'name must be 2-40 characters'
    }
    if (RESERVED_BUILTIN_NAMES.has(name) || findStyle(name)) {
      return `name "${name}" collides with a built-in style; choose a different name`
    }
    out.name = name
  }

  if (body.summary !== undefined || !opts.allowMissing) {
    if (typeof body.summary !== 'string') return 'summary is required'
    const s = body.summary.trim()
    if (s.length < 1 || s.length > MAX_TEXT) {
      return `summary must be 1-${MAX_TEXT} chars`
    }
    out.summary = s
  }

  if (body.when_to_use !== undefined || !opts.allowMissing) {
    if (typeof body.when_to_use !== 'string') return 'when_to_use is required'
    const s = body.when_to_use.trim()
    if (s.length < 1 || s.length > MAX_TEXT) {
      return `when_to_use must be 1-${MAX_TEXT} chars`
    }
    out.when_to_use = s
  }

  if (body.html !== undefined || !opts.allowMissing) {
    if (typeof body.html !== 'string') return 'html is required'
    if (body.html.length < 1 || body.html.length > MAX_HTML) {
      return `html must be 1-${Math.floor(MAX_HTML / 1024)}KB`
    }
    out.html = body.html
  }

  return out as { name: string; summary: string; when_to_use: string; html: string }
}

customStyleRoutes.get('/', (c) => {
  const user = c.get('user')
  const rows = db
    .select({
      id: customStyles.id,
      name: customStyles.name,
      summary: customStyles.summary,
      when_to_use: customStyles.when_to_use,
      created_at: customStyles.created_at,
      updated_at: customStyles.updated_at,
    })
    .from(customStyles)
    .where(eq(customStyles.user_id, user.id))
    .orderBy(desc(customStyles.updated_at))
    .all()
  return c.json(rows)
})

customStyleRoutes.get('/:name', (c) => {
  const user = c.get('user')
  const name = c.req.param('name')
  const row = db
    .select()
    .from(customStyles)
    .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, name)))
    .get()
  if (!row) return c.json({ error: 'not found' }, 404)
  return c.json(row)
})

// Returns the raw HTML directly so the /styles UI can iframe-preview it
// — same trick the built-in /api/styles/:name/preview route uses.
customStyleRoutes.get('/:name/preview', (c) => {
  const user = c.get('user')
  const name = c.req.param('name')
  const row = db
    .select({ html: customStyles.html, updated_at: customStyles.updated_at })
    .from(customStyles)
    .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, name)))
    .get()
  if (!row) return c.text('not found', 404)
  return new Response(row.html, {
    headers: {
      ...USER_HTML_HEADERS,
      // Same short cache as the built-in preview — bust by appending
      // ?v=updated_at on the client side when needed.
      'cache-control': 'private, max-age=60',
    },
  })
})

customStyleRoutes.post('/', async (c) => {
  const user = c.get('user')
  let body: Body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  const v = validate(body, { allowMissing: false })
  if (typeof v === 'string') return c.json({ error: v }, 400)

  // Race against the per-user uniqueness index — surface the friendlier
  // error than a raw SQL UNIQUE violation.
  const clash = db
    .select({ id: customStyles.id })
    .from(customStyles)
    .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, v.name)))
    .get()
  if (clash) return c.json({ error: `you already have a style named "${v.name}"` }, 409)

  const res = db
    .insert(customStyles)
    .values({
      user_id: user.id,
      name: v.name,
      summary: v.summary,
      when_to_use: v.when_to_use,
      html: v.html,
    })
    .run()
  const id = Number(res.lastInsertRowid)
  const row = db.select().from(customStyles).where(eq(customStyles.id, id)).get()!
  return c.json(row, 201)
})

customStyleRoutes.put('/:name', async (c) => {
  const user = c.get('user')
  const oldName = c.req.param('name')
  const existing = db
    .select()
    .from(customStyles)
    .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, oldName)))
    .get()
  if (!existing) return c.json({ error: 'not found' }, 404)

  let body: Body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  const v = validate(body, { allowMissing: true })
  if (typeof v === 'string') return c.json({ error: v }, 400)

  // If renaming, refuse silent overwrite of a sibling row.
  if (v.name && v.name !== existing.name) {
    const clash = db
      .select({ id: customStyles.id })
      .from(customStyles)
      .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, v.name)))
      .get()
    if (clash) return c.json({ error: `you already have a style named "${v.name}"` }, 409)
  }

  const updates: Record<string, unknown> = {
    updated_at: sql`CURRENT_TIMESTAMP` as unknown as string,
  }
  if (v.name) updates.name = v.name
  if (v.summary) updates.summary = v.summary
  if (v.when_to_use) updates.when_to_use = v.when_to_use
  if (v.html) updates.html = v.html
  db.update(customStyles).set(updates).where(eq(customStyles.id, existing.id)).run()
  const row = db.select().from(customStyles).where(eq(customStyles.id, existing.id)).get()!
  return c.json(row)
})

customStyleRoutes.delete('/:name', (c) => {
  const user = c.get('user')
  const name = c.req.param('name')
  const res = db
    .delete(customStyles)
    .where(and(eq(customStyles.user_id, user.id), eq(customStyles.name, name)))
    .run()
  if (res.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})
