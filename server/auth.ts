// Auth resolution for HTTP requests.
//
// Two paths land a User on the request context:
//
//   - Session: the Cloudflare Access "cf-access-authenticated-user-email"
//     header. The browser UI travels this path. Implicitly carries every
//     scope ("*") — the operator behind CF Access is fully trusted.
//
//   - Token: an Authorization: Bearer pt_... header. Hash-looked-up against
//     api_tokens; the row's scope CSV becomes the request's scope set.
//
// The two paths produce the same User shape so handlers don't care which
// they came from. Routes that mint/revoke tokens additionally call
// requireSession to keep a leaked token from minting siblings.

import type { Context, Next } from 'hono'
import { getCookie } from 'hono/cookie'
import { db } from './db'
import { users, apiTokens } from './schema'
import type { User } from './schema'
import { eq, and, isNull } from 'drizzle-orm'
import { SESSION_COOKIE, resolveSessionUser, oidcEnabled } from './oidc'

export type Scope =
  | 'pages:read'
  | 'pages:write'
  | 'tokens:read'
  | 'tokens:write'
  | '*'

export const ALL_SCOPES: Scope[] = [
  'pages:read',
  'pages:write',
  'tokens:read',
  'tokens:write',
]

export type AuthMethod = 'session' | 'token'

export type AuthUser = User & {
  scopes: Scope[]
  authMethod: AuthMethod
  tokenId?: number
}

export type AuthVars = { user: AuthUser }

function isKnownScope(s: string): s is Scope {
  return s === '*' || (ALL_SCOPES as string[]).includes(s)
}

export function hasScope(have: Scope[], want: Scope): boolean {
  return have.some((s) => s === '*' || s === want)
}

export function parseScopes(csv: string): Scope[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter(isKnownScope)
}

export async function hashToken(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const RAW_TOKEN_PREFIX = 'pt_'

export function mintRawToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return RAW_TOKEN_PREFIX + hex
}

// Visible prefix: "pt_" + 8 hex chars (11 chars total). Stored on the row
// so the UI can render "pt_abcd1234..." for visual identification.
export const TOKEN_PREFIX_LEN = RAW_TOKEN_PREFIX.length + 8

function extractBearer(header: string | undefined): string | null {
  if (!header) return null
  const m = /^bearer\s+(.+)$/i.exec(header.trim())
  return m ? m[1].trim() : null
}

// Dev/local fallback only — creates a placeholder user when OIDC is not
// configured so localhost development works without bringing up an IdP.
// Never called when OIDC_ISSUER is set. Backfills username if missing so
// share URLs (/p/<username>/<slug>) work in dev mode too.
function devUser(email: string): User {
  let u = db.select().from(users).where(eq(users.email, email)).get()
  if (!u) {
    const username = pickDevUsername(email)
    db.insert(users).values({ email, username }).run()
    u = db.select().from(users).where(eq(users.email, email)).get()!
  } else if (!u.username) {
    const username = pickDevUsername(email)
    db.update(users).set({ username }).where(eq(users.id, u.id)).run()
    u = db.select().from(users).where(eq(users.id, u.id)).get()!
  }
  return u
}

function pickDevUsername(email: string): string {
  const base =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'user'
  let candidate = base
  let n = 1
  while (db.select().from(users).where(eq(users.username, candidate)).get()) {
    n += 1
    candidate = `${base}-${n}`
  }
  return candidate
}

async function lookupTokenUser(authHeader: string | undefined): Promise<AuthUser | null> {
  const raw = extractBearer(authHeader)
  if (!raw) return null
  const hash = await hashToken(raw)
  const row = db
    .select({
      tokenId: apiTokens.id,
      scopes: apiTokens.scopes,
      expires_at: apiTokens.expires_at,
      user: users,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.user_id))
    .where(and(eq(apiTokens.token_hash, hash), isNull(apiTokens.revoked_at)))
    .get()
  if (!row) return null
  if (row.expires_at) {
    const exp = new Date(row.expires_at)
    if (!isNaN(exp.getTime()) && exp.getTime() < Date.now()) return null
  }
  // Best-effort touch — don't block the request on this.
  queueMicrotask(() => {
    try {
      db.update(apiTokens)
        .set({ last_used_at: new Date().toISOString() })
        .where(eq(apiTokens.id, row.tokenId))
        .run()
    } catch {
      // swallow
    }
  })
  return {
    ...row.user,
    scopes: parseScopes(row.scopes),
    authMethod: 'token',
    tokenId: row.tokenId,
  }
}

function lookupCookieUser(c: Context): AuthUser | null {
  const token = getCookie(c, SESSION_COOKIE)
  const u = resolveSessionUser(token)
  if (!u) return null
  return { ...u, scopes: ['*'], authMethod: 'session' }
}

// authMiddleware resolves the request to an AuthUser. Bearer beats cookie
// when both are present so a stale browser session can't silently override
// an explicit API token.
//
// When OIDC is not configured (no OIDC_ISSUER) we fall back to a synthetic
// `local@dev` user — useful for local dev and the smoke tests, never
// reachable in production where OIDC env vars are required.
export function authMiddleware() {
  return async (c: Context<{ Variables: AuthVars }>, next: Next) => {
    const tokenUser = await lookupTokenUser(c.req.header('Authorization'))
    if (tokenUser) {
      c.set('user', tokenUser)
      return next()
    }
    const cookieUser = lookupCookieUser(c)
    if (cookieUser) {
      c.set('user', cookieUser)
      return next()
    }
    if (!oidcEnabled()) {
      const u = devUser('local@dev')
      c.set('user', { ...u, scopes: ['*'], authMethod: 'session' })
      return next()
    }
    return c.json({ error: 'authentication required' }, 401)
  }
}

export function requireScope(scope: Scope) {
  return async (c: Context<{ Variables: AuthVars }>, next: Next) => {
    const u = c.get('user')
    if (!u) return c.json({ error: 'authentication required' }, 401)
    if (!hasScope(u.scopes, scope)) {
      return c.json({ error: `missing scope: ${scope}` }, 403)
    }
    return next()
  }
}

// requireSession rejects token-authenticated callers. Used by the token
// CRUD routes so a leaked token can't be used to mint or revoke siblings.
export function requireSession() {
  return async (c: Context<{ Variables: AuthVars }>, next: Next) => {
    const u = c.get('user')
    if (!u) return c.json({ error: 'authentication required' }, 401)
    if (u.authMethod === 'token') {
      return c.json({ error: 'token management requires session authentication' }, 403)
    }
    return next()
  }
}

export { isKnownScope }
