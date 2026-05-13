// OIDC sign-in for pages.
//
// Flow (mirrors hours/internal/auth/auth.go):
//   GET  /auth/login    → mint state, set state cookie, redirect to IdP
//   GET  /auth/callback → verify state, exchange code, verify id_token,
//                         upsert user, mint opaque session, set cookie,
//                         redirect to ?return= (or /)
//   POST /auth/logout   → delete session row, clear cookie
//   GET  /api/me        → return current user or 401
//
// Sessions are opaque 32-byte random hex strings stored in the `sessions`
// table with a 30-day expiry. The cookie is HttpOnly + (in prod) Secure.
// The bearer-token path is unchanged — when both cookie and Authorization
// header are present, bearer wins (see auth.ts).
//
// Config is read once at boot from env vars:
//   OIDC_ISSUER          discovery URL (required)
//   OIDC_CLIENT_ID       (required)
//   OIDC_CLIENT_SECRET   (required for confidential clients; required here)
//   OIDC_REDIRECT_URL    full https://.../auth/callback URL (required)
//   OIDC_ALLOWED_EMAILS    comma-separated allowlist of authorized emails
//   OIDC_ALLOW_OPEN_SIGNUP "1"/"true" to permit any IdP-verified email.
//                          Required when OIDC_ALLOWED_EMAILS is empty —
//                          fail-closed by default to avoid accidentally
//                          deploying a fully open service.
//   OIDC_SCOPES            space-separated, default "openid profile email"
//   OIDC_COOKIE_SECURE     "1"/"true" to mark the cookie Secure (set in prod)

import * as oidc from 'openid-client'
import type { Context } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { db } from './db'
import { users, sessions } from './schema'
import type { User } from './schema'
import { eq, lt } from 'drizzle-orm'

export const SESSION_COOKIE = 'pages_session'
const STATE_COOKIE = 'pages_oauth_state'
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
const STATE_TTL_SECONDS = 10 * 60

type OidcConfig = {
  client: oidc.Configuration
  redirectUrl: string
  allowedEmails: Set<string>
  // True only when the operator explicitly opted in via
  // OIDC_ALLOW_OPEN_SIGNUP=1. When false AND allowedEmails is empty, the
  // callback refuses every login — fail-closed default. The previous
  // shape ("empty allowlist = open signup") was too easy to deploy by
  // accident in front of a permissive IdP policy.
  allowOpenSignup: boolean
  cookieSecure: boolean
  scopes: string
}

let cached: OidcConfig | null | undefined

// configure() is async and called lazily so a missing OIDC_ISSUER at boot
// doesn't crash dev mode. Returns null when not configured.
export async function getOidc(): Promise<OidcConfig | null> {
  if (cached !== undefined) return cached
  const issuer = (process.env.OIDC_ISSUER ?? '').trim()
  const clientId = (process.env.OIDC_CLIENT_ID ?? '').trim()
  const clientSecret = (process.env.OIDC_CLIENT_SECRET ?? '').trim()
  const redirectUrl = (process.env.OIDC_REDIRECT_URL ?? '').trim()
  if (!issuer || !clientId || !redirectUrl) {
    cached = null
    return null
  }
  try {
    const client = await oidc.discovery(new URL(issuer), clientId, clientSecret)

    // Force the redirect_uri sent to the token endpoint to match what's
    // registered with the IdP. Without this override the openid-client
    // library derives redirect_uri from the incoming callback URL — which,
    // when we're behind Traefik + Cloudflare Tunnel, shows up as the
    // internal http://localhost:3000/... rather than the public
    // https://pages.arlint.dev/... URL. Cloudflare Access correctly
    // rejects that mismatch on the token exchange with
    // "Invalid redirect_uri - does not match configured values".
    //
    // The library specifically documents this customFetch shape for that
    // exact problem.
    ;(client as unknown as Record<symbol, unknown>)[oidc.customFetch] = (
      ...args: Parameters<typeof fetch>
    ) => {
      const [, options] = args
      const body = (options as RequestInit | undefined)?.body
      if (body instanceof URLSearchParams && body.get('grant_type') === 'authorization_code') {
        body.set('redirect_uri', redirectUrl)
      }
      return fetch(...args)
    }

    const allowed = new Set(
      (process.env.OIDC_ALLOWED_EMAILS ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    )
    const allowOpenSignup = ['1', 'true', 'yes'].includes(
      (process.env.OIDC_ALLOW_OPEN_SIGNUP ?? '').toLowerCase().trim(),
    )
    if (allowed.size === 0 && !allowOpenSignup) {
      console.warn(
        'OIDC: no allowlist configured and OIDC_ALLOW_OPEN_SIGNUP is not set — every sign-in will be refused. Set OIDC_ALLOWED_EMAILS=foo@bar.com,... or OIDC_ALLOW_OPEN_SIGNUP=1.',
      )
    }
    const scopes = (process.env.OIDC_SCOPES ?? 'openid profile email').trim()
    const cookieSecure = ['1', 'true', 'yes'].includes(
      (process.env.OIDC_COOKIE_SECURE ?? '').toLowerCase().trim(),
    )
    cached = {
      client,
      redirectUrl,
      allowedEmails: allowed,
      allowOpenSignup,
      cookieSecure,
      scopes,
    }
    return cached
  } catch (err) {
    console.error('OIDC discovery failed:', err)
    cached = null
    return null
  }
}

export function oidcEnabled(): boolean {
  return !!(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_REDIRECT_URL)
}

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// SHA-256(cookie) → hex. Stored in sessions.token so a DB read does
// not yield working cookies. Mirrors the api_tokens.token_hash pattern.
async function hashCookie(raw: string): Promise<string> {
  const data = new TextEncoder().encode(raw)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// safeReturnPath validates a post-login `return=` URL. Only same-origin
// absolute paths (starting with "/", not "//" or "/\") are allowed. Mirrors
// the rule in hours/internal/auth/auth.go — defends against open-redirect
// shenanigans where `?return=//evil.com` would bounce a logged-in user off
// the site post-callback.
function safeReturnPath(p: string | null | undefined): string {
  if (!p) return '/'
  if (!p.startsWith('/')) return '/'
  if (p.startsWith('//') || p.startsWith('/\\') || p.includes('\\')) return '/'
  return p
}

// loginHandler kicks off the OIDC dance. State + nonce + PKCE verifier are
// stashed in a single short-lived cookie so the IdP roundtrip doesn't need
// server-side state.
export async function loginHandler(c: Context): Promise<Response> {
  const cfg = await getOidc()
  if (!cfg) return c.text('OIDC not configured', 503)

  const state = oidc.randomState()
  const nonce = oidc.randomNonce()
  const codeVerifier = oidc.randomPKCECodeVerifier()
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier)
  const ret = safeReturnPath(c.req.query('return'))

  // Pack state|nonce|verifier|return into the state cookie. All components
  // are URL-safe (hex or base64url) so a `|` delimiter is unambiguous.
  setCookie(c, STATE_COOKIE, `${state}|${nonce}|${codeVerifier}|${ret}`, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    // SameSite=None+Secure so the cookie survives the cross-origin redirect
    // back from the IdP. Lax fails for IdPs that bounce through helper
    // domains (e.g. Cloudflare Access SaaS OIDC).
    sameSite: cfg.cookieSecure ? 'None' : 'Lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })

  const url = oidc.buildAuthorizationUrl(cfg.client, {
    redirect_uri: cfg.redirectUrl,
    scope: cfg.scopes,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })
  return c.redirect(url.toString())
}

// callbackHandler completes the exchange. Failures render as plain text
// because there's no SPA shell to lean on at this point in the flow.
export async function callbackHandler(c: Context): Promise<Response> {
  const cfg = await getOidc()
  if (!cfg) return c.text('OIDC not configured', 503)

  const stateCookie = getCookie(c, STATE_COOKIE)
  if (!stateCookie) return c.text('missing state cookie', 400)
  deleteCookie(c, STATE_COOKIE, { path: '/' })

  const parts = stateCookie.split('|')
  if (parts.length < 4) return c.text('malformed state cookie', 400)
  const [expectedState, expectedNonce, codeVerifier, ret] = parts

  // Rebuild the callback URL using the registered redirect URI as the
  // base, carrying over only the query string from the incoming request.
  // This avoids passing the library the internal `http://localhost:3000`
  // URL it sees from behind Traefik — its derived redirect_uri would then
  // not match what's registered with the IdP. (We also belt-and-braces
  // override redirect_uri in customFetch on cfg.client; this is just the
  // first line of defence so the library's internal checks pass.)
  const incoming = new URL(c.req.url)
  const callbackUrl = new URL(cfg.redirectUrl)
  callbackUrl.search = incoming.search

  let tokens: Awaited<ReturnType<typeof oidc.authorizationCodeGrant>>
  try {
    tokens = await oidc.authorizationCodeGrant(cfg.client, callbackUrl, {
      expectedState,
      expectedNonce,
      pkceCodeVerifier: codeVerifier,
      idTokenExpected: true,
    })
  } catch (err) {
    console.error('OIDC code exchange failed:', err)
    return c.text(`code exchange failed: ${(err as Error).message}`, 400)
  }

  const claims = tokens.claims()
  if (!claims) return c.text('id_token missing claims', 400)
  const subject = String(claims.sub)
  const emailRaw = (claims.email as string | undefined) ?? ''
  const email = emailRaw.trim().toLowerCase()
  if (!email) return c.text('id_token missing email claim', 401)
  // Fail-closed: refuse the sign-in unless either (a) the email is on
  // the explicit allowlist, or (b) the operator opted into open signup.
  // The previous behaviour was "empty allowlist = open signup" which
  // turned an unset env var into a fully open service.
  const onAllowlist = cfg.allowedEmails.has(email)
  if (!onAllowlist && !cfg.allowOpenSignup) {
    return c.text('email not authorized', 403)
  }
  const name = (claims.name as string | undefined) ?? ''

  const user = upsertOidcUser(subject, email, name)
  const sessionToken = await createSession(user.id)

  setCookie(c, SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: cfg.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })

  return c.redirect(safeReturnPath(ret))
}

export async function logoutHandler(c: Context): Promise<Response> {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) {
    db.delete(sessions).where(eq(sessions.token, token)).run()
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
}

// upsertOidcUser inserts a fresh user or refreshes email/name/last_login
// on an existing row. Match precedence is oidc_subject → email — if a user
// was created earlier with the same email but no subject (e.g. legacy CF
// Access path), we link the subject onto that row instead of creating a
// duplicate.
function upsertOidcUser(subject: string, email: string, name: string): User {
  const bySub = db.select().from(users).where(eq(users.oidc_subject, subject)).get()
  if (bySub) {
    db.update(users)
      .set({ email, name: name || bySub.name, last_login_at: new Date().toISOString() })
      .where(eq(users.id, bySub.id))
      .run()
    return db.select().from(users).where(eq(users.id, bySub.id)).get()!
  }
  const byEmail = db.select().from(users).where(eq(users.email, email)).get()
  if (byEmail) {
    db.update(users)
      .set({
        oidc_subject: subject,
        name: name || byEmail.name,
        last_login_at: new Date().toISOString(),
      })
      .where(eq(users.id, byEmail.id))
      .run()
    return db.select().from(users).where(eq(users.id, byEmail.id)).get()!
  }
  // New user — derive a unique username from the email's local part. The
  // slugify + collision loop is the same shape the boot-time backfill
  // uses; we duplicate it here so a fresh signup gets a username in the
  // same transaction it's inserted in.
  const username = pickUsername(email)
  db.insert(users)
    .values({
      email,
      name,
      username,
      oidc_subject: subject,
      last_login_at: new Date().toISOString(),
    })
    .run()
  return db.select().from(users).where(eq(users.email, email)).get()!
}

function slugifyUsername(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || ''
  )
}

function pickUsername(email: string): string {
  const base = slugifyUsername(email.split('@')[0] || '') || 'user'
  let candidate = base
  let n = 1
  while (db.select().from(users).where(eq(users.username, candidate)).get()) {
    n += 1
    candidate = `${base}-${n}`
  }
  return candidate
}

async function createSession(userId: number): Promise<string> {
  // The cookie value the browser holds. Returned to the caller; never
  // stored in plaintext on the server side — we persist its SHA-256.
  const cookie = randomHex(32)
  const hash = await hashCookie(cookie)
  const expires = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()
  db.insert(sessions).values({ token: hash, user_id: userId, expires_at: expires }).run()
  // Best-effort GC of expired rows. SQLite text comparison works because
  // ISO 8601 sorts lexicographically.
  db.delete(sessions).where(lt(sessions.expires_at, new Date().toISOString())).run()
  return cookie
}

// resolveSessionUser is called from auth.ts to translate a cookie into a
// User. Returns null for missing/expired/unknown tokens. Expired rows are
// deleted lazily on lookup so the table stays trim even without the GC
// pass in createSession.
//
// Hashes the supplied cookie and looks up by hash — the DB never sees
// the raw cookie value.
export async function resolveSessionUser(token: string | undefined): Promise<User | null> {
  if (!token) return null
  const hash = await hashCookie(token)
  const row = db
    .select({
      user: users,
      expires: sessions.expires_at,
      sessionToken: sessions.token,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(eq(sessions.token, hash))
    .get()
  if (!row) return null
  const expiresMs = Date.parse(row.expires)
  if (!Number.isFinite(expiresMs) || expiresMs < Date.now()) {
    db.delete(sessions).where(eq(sessions.token, row.sessionToken)).run()
    return null
  }
  return row.user
}
