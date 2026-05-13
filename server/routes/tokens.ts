// /api/tokens — list / mint / revoke. Session-only (requireSession at the
// route mount in server/index.ts). The DB only stores the SHA-256 hash of
// each token; the raw value is returned exactly once by the mint endpoint
// and is unrecoverable thereafter.

import { Hono } from 'hono'
import { db } from '../db'
import { apiTokens } from '../schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import {
  ALL_SCOPES,
  type AuthVars,
  hashToken,
  isKnownScope,
  mintRawToken,
  TOKEN_PREFIX_LEN,
  type Scope,
} from '../auth'

export const tokenRoutes = new Hono<{ Variables: AuthVars }>()

tokenRoutes.get('/', (c) => {
  const user = c.get('user')
  const rows = db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      scopes: apiTokens.scopes,
      token_prefix: apiTokens.token_prefix,
      expires_at: apiTokens.expires_at,
      last_used_at: apiTokens.last_used_at,
      created_at: apiTokens.created_at,
    })
    .from(apiTokens)
    .where(and(eq(apiTokens.user_id, user.id), isNull(apiTokens.revoked_at)))
    .orderBy(desc(apiTokens.created_at))
    .all()
  return c.json(
    rows.map((r) => ({
      ...r,
      scopes: r.scopes.split(',').map((s) => s.trim()).filter(Boolean),
    })),
  )
})

tokenRoutes.post('/', async (c) => {
  const user = c.get('user')
  let body: { name?: unknown; scopes?: unknown; expires_at?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return c.json({ error: 'name is required' }, 400)
  if (name.length > 100) return c.json({ error: 'name must be 100 chars or fewer' }, 400)

  if (!Array.isArray(body.scopes) || body.scopes.length === 0) {
    return c.json({ error: 'at least one scope is required' }, 400)
  }
  const seen = new Set<string>()
  const cleaned: Scope[] = []
  for (const raw of body.scopes) {
    if (typeof raw !== 'string') continue
    const s = raw.trim()
    if (!s) continue
    if (!isKnownScope(s)) {
      return c.json({ error: `unknown scope: ${s}` }, 400)
    }
    if (seen.has(s)) continue
    seen.add(s)
    cleaned.push(s as Scope)
  }
  if (cleaned.length === 0) return c.json({ error: 'at least one scope is required' }, 400)

  let expiresAt: string | null = null
  if (typeof body.expires_at === 'string' && body.expires_at.trim()) {
    const t = new Date(body.expires_at.trim())
    if (isNaN(t.getTime())) {
      return c.json({ error: 'invalid expires_at — expected ISO 8601' }, 400)
    }
    if (t.getTime() <= Date.now()) {
      return c.json({ error: 'expires_at must be in the future' }, 400)
    }
    expiresAt = t.toISOString()
  }

  const raw = mintRawToken()
  const hash = await hashToken(raw)
  const prefix = raw.slice(0, TOKEN_PREFIX_LEN)

  const result = db
    .insert(apiTokens)
    .values({
      user_id: user.id,
      name,
      token_hash: hash,
      token_prefix: prefix,
      scopes: cleaned.join(','),
      expires_at: expiresAt,
    })
    .run()

  const id = Number(result.lastInsertRowid)
  const created = db.select().from(apiTokens).where(eq(apiTokens.id, id)).get()!

  return c.json(
    {
      id: created.id,
      name: created.name,
      scopes: cleaned,
      token_prefix: created.token_prefix,
      expires_at: created.expires_at,
      created_at: created.created_at,
      // ONE-TIME — never returned again.
      token: raw,
    },
    201,
  )
})

tokenRoutes.delete('/:id', (c) => {
  const user = c.get('user')
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'bad id' }, 400)
  const res = db
    .update(apiTokens)
    .set({ revoked_at: new Date().toISOString() })
    .where(
      and(
        eq(apiTokens.id, id),
        eq(apiTokens.user_id, user.id),
        isNull(apiTokens.revoked_at),
      ),
    )
    .run()
  if (res.changes === 0) return c.json({ error: 'not found' }, 404)
  return c.json({ ok: true })
})

// GET /api/tokens/scopes — used by the UI to populate the scope checkboxes.
tokenRoutes.get('/_scopes', (c) => c.json({ scopes: ALL_SCOPES }))
