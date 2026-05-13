// OAuth 2.1 authorization server for MCP clients.
//
// Implements the surface area required by the MCP authorization spec
// (2025-06-18), letting Claude Desktop & friends add this server as a
// remote MCP server with the native OAuth flow — no mcp-remote shim
// needed. We do NOT implement token introspection (RFC 7662) or JWT
// access tokens; opaque tokens + DB lookup is plenty for this scale.
//
// Endpoints (mounted by server/index.ts):
//
//   GET  /.well-known/oauth-protected-resource           (PRM, root form)
//   GET  /.well-known/oauth-protected-resource/api/mcp   (PRM, MCP-pathed)
//   GET  /.well-known/oauth-authorization-server         (RFC 8414)
//   POST /oauth/register                                  (RFC 7591 DCR)
//   GET  /oauth/authorize                                 (PKCE-only)
//   POST /oauth/token                                     (code + refresh)
//   POST /oauth/revoke                                    (RFC 7009)
//   GET  /oauth/consent-context                           (SPA helper)
//   POST /oauth/consent                                   (SPA approve/deny)
//
// Scopes issued by OAuth are deliberately limited to `pages:read` and
// `pages:write`. Connected apps must not be able to mint personal API
// tokens — `tokens:*` scopes are session-only.

import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { db } from '../db'
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthPendingConsent,
  users,
} from '../schema'
import { eq, and, isNull, lt } from 'drizzle-orm'
import { SESSION_COOKIE, resolveSessionUser } from '../oidc'
import type { Scope, AuthVars } from '../auth'

// ----- config -------------------------------------------------------------

// The canonical, externally-reachable base URL. Used for the issuer claim
// in AS metadata and for the absolute URLs in PRM. Mismatches here cause
// MCP clients to reject the flow ("issuer in metadata didn't match the
// host I asked"), so this must match what the caller sees.
export function publicBaseUrl(): string {
  return (process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    'https://pages.arlint.dev')
}

// Scopes this server is willing to issue over OAuth. Intentionally a
// strict subset of the API's full scope set — see top-of-file comment.
const OAUTH_ISSUABLE_SCOPES = ['pages:read', 'pages:write'] as const
type OauthScope = (typeof OAUTH_ISSUABLE_SCOPES)[number]

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const AUTH_CODE_TTL_SECONDS = 60 // 60 seconds, per spec recommendation
const PENDING_CONSENT_TTL_SECONDS = 10 * 60 // 10 minutes

const ACCESS_TOKEN_PREFIX = 'oa_'
const REFRESH_TOKEN_PREFIX = 'or_'

// ----- crypto helpers ----------------------------------------------------

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes))
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Compute the S256 PKCE code_challenge from a verifier:
//   base64url(SHA-256(verifier)). RFC 7636 §4.2.
async function s256(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  // base64url, no padding
  let b64 = btoa(String.fromCharCode(...new Uint8Array(digest)))
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return b64
}

// PKCE strings: ASCII unreserved chars, 43-128 long (RFC 7636 §4.1).
const PKCE_RE = /^[A-Za-z0-9\-._~]{43,128}$/

// ----- redirect_uri validation -------------------------------------------

// MCP / OAuth 2.1 redirect_uri rules:
//   - https://… anywhere
//   - http://localhost or http://127.0.0.1 (loopback dev clients)
//   - custom-scheme URIs like claude://callback (native clients)
//
// We refuse http://<anything-else> outright. Everything is parsed via
// new URL() so weird strings don't slip through.
function isAllowedRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !raw) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  // Reject userinfo / fragments in registered redirects — they're a
  // common source of confusion and we never want to silently lose data.
  if (u.username || u.password || u.hash) return false
  if (u.protocol === 'https:') return true
  if (u.protocol === 'http:') {
    const host = u.hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
  }
  // Custom scheme — RFC 8252 native-app pattern (e.g. "claude://cb").
  // Require a colon-followed-by-/ shape (already true since URL parsed),
  // refuse the well-known dangerous-in-browsers schemes.
  const proto = u.protocol.replace(/:$/, '').toLowerCase()
  if (proto === 'javascript' || proto === 'data' || proto === 'file') return false
  // Must contain a dot or a hyphen in the scheme name (RFC 7595 best
  // practice for reverse-DNS-style schemes) OR be a single-segment
  // scheme of >=4 chars to avoid accidentally accepting nonsense like
  // "a:b". This is intentionally pragmatic, not strict.
  if (proto.length < 3) return false
  return true
}

// ----- DCR registration rate limit ---------------------------------------

// In-memory per-IP sliding window. 10 registrations / hour. Map is keyed
// by client IP (best-effort from x-forwarded-for or the socket). Restart
// resets — fine for a homelab service, and there's no DB cost.
const REGISTRATION_LIMIT_WINDOW_MS = 60 * 60 * 1000
const REGISTRATION_LIMIT_MAX = 10
const registrationBuckets = new Map<string, number[]>()

function clientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || 'unknown'
}

function checkRegistrationLimit(ip: string): boolean {
  const now = Date.now()
  const cutoff = now - REGISTRATION_LIMIT_WINDOW_MS
  const arr = (registrationBuckets.get(ip) || []).filter((t) => t >= cutoff)
  if (arr.length >= REGISTRATION_LIMIT_MAX) {
    registrationBuckets.set(ip, arr)
    return false
  }
  arr.push(now)
  registrationBuckets.set(ip, arr)
  return true
}

// ----- helpers -----------------------------------------------------------

function parseRegisteredRedirectUris(json: string): string[] {
  try {
    const v = JSON.parse(json)
    if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v
  } catch {
    /* swallow */
  }
  return []
}

function sanitizeScopes(requested: string | undefined | null): OauthScope[] {
  if (!requested) return ['pages:read']
  const parts = requested
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: OauthScope[] = []
  for (const s of parts) {
    if ((OAUTH_ISSUABLE_SCOPES as readonly string[]).includes(s) && !out.includes(s as OauthScope)) {
      out.push(s as OauthScope)
    }
  }
  return out
}

// Build an OAuth-style error URL fragment. Used on the authorize flow
// when we redirect back to the client with an error.
function clientErrorRedirect(
  redirectUri: string,
  error: string,
  description: string,
  state?: string | null,
): string {
  const u = new URL(redirectUri)
  u.searchParams.set('error', error)
  u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  return u.toString()
}

function jsonError(c: Context, status: number, error: string, description?: string) {
  return c.json(
    {
      error,
      error_description: description,
    },
    status as any,
  )
}

// Session-gating used by /oauth/consent-context and /oauth/consent.
async function requireOauthSession(c: Context): Promise<number | null> {
  const cookie = getCookie(c, SESSION_COOKIE)
  const u = await resolveSessionUser(cookie)
  if (u) return u.id
  // In dev mode (no OIDC configured) there's no session cookie — fall
  // back to the synthetic local@dev user the rest of the system uses so
  // local end-to-end testing of the OAuth flow works without an IdP. We
  // create the user lazily here because /oauth/* doesn't go through
  // authMiddleware (where the same fallback exists for /api/*).
  if (!process.env.OIDC_ISSUER) {
    let row = db.select().from(users).where(eq(users.email, 'local@dev')).get()
    if (!row) {
      db.insert(users).values({ email: 'local@dev', username: 'local' }).run()
      row = db.select().from(users).where(eq(users.email, 'local@dev')).get()
    }
    if (row) return row.id
  }
  return null
}

// ----- discovery metadata -----------------------------------------------

// These are functions (not constants) so PUBLIC_BASE_URL can change
// between boot and request — and so unit tests can override at runtime.
function authorizationServerMetadata() {
  const base = publicBaseUrl()
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    revocation_endpoint: `${base}/oauth/revoke`,
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [...OAUTH_ISSUABLE_SCOPES],
    service_documentation: `${base}/`,
  }
}

function protectedResourceMetadata() {
  const base = publicBaseUrl()
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
    scopes_supported: [...OAUTH_ISSUABLE_SCOPES],
    bearer_methods_supported: ['header'],
    resource_documentation: `${base}/`,
  }
}

// ----- main router ------------------------------------------------------

export const oauthRoutes = new Hono<{ Variables: AuthVars }>()

// -- discovery -----------------------------------------------------------

// Both PRM paths return the same document. RFC 9728 says the canonical
// location is /.well-known/oauth-protected-resource appended with the
// resource path; older clients query just the root. We serve both.
export function protectedResourceMetadataHandler(c: Context) {
  return c.json(protectedResourceMetadata())
}

export function authorizationServerMetadataHandler(c: Context) {
  return c.json(authorizationServerMetadata())
}

// -- registration --------------------------------------------------------

oauthRoutes.post('/register', async (c) => {
  const ip = clientIp(c)
  if (!checkRegistrationLimit(ip)) {
    return jsonError(c, 429, 'too_many_requests', 'registration rate limit exceeded')
  }

  let body: Record<string, unknown>
  try {
    body = await c.req.json()
  } catch {
    return jsonError(c, 400, 'invalid_client_metadata', 'request body must be JSON')
  }

  const clientName = typeof body.client_name === 'string' ? body.client_name.trim() : ''
  if (!clientName) {
    return jsonError(c, 400, 'invalid_client_metadata', 'client_name is required')
  }
  if (clientName.length > 200) {
    return jsonError(c, 400, 'invalid_client_metadata', 'client_name too long')
  }

  const redirectUrisRaw = body.redirect_uris
  if (!Array.isArray(redirectUrisRaw) || redirectUrisRaw.length === 0) {
    return jsonError(
      c,
      400,
      'invalid_redirect_uri',
      'redirect_uris must be a non-empty array',
    )
  }
  if (redirectUrisRaw.length > 16) {
    return jsonError(c, 400, 'invalid_redirect_uri', 'too many redirect_uris')
  }
  const redirectUris: string[] = []
  for (const r of redirectUrisRaw) {
    if (!isAllowedRedirectUri(r)) {
      return jsonError(c, 400, 'invalid_redirect_uri', `redirect_uri rejected: ${String(r)}`)
    }
    redirectUris.push(r)
  }

  // grant_types & response_types — accept the MCP-typical defaults if the
  // client doesn't send them. Refuse anything we don't support (esp.
  // password / implicit / client_credentials).
  const SUPPORTED_GRANTS = new Set(['authorization_code', 'refresh_token'])
  let grantTypes: string[]
  if (Array.isArray(body.grant_types)) {
    grantTypes = body.grant_types
      .filter((g): g is string => typeof g === 'string')
      .map((g) => g.trim())
  } else {
    grantTypes = ['authorization_code', 'refresh_token']
  }
  for (const g of grantTypes) {
    if (!SUPPORTED_GRANTS.has(g)) {
      return jsonError(c, 400, 'invalid_client_metadata', `unsupported grant_type: ${g}`)
    }
  }
  if (!grantTypes.includes('authorization_code')) {
    grantTypes.push('authorization_code')
  }

  if (Array.isArray(body.response_types)) {
    for (const rt of body.response_types) {
      if (rt !== 'code') {
        return jsonError(c, 400, 'invalid_client_metadata', `unsupported response_type: ${rt}`)
      }
    }
  }

  // token_endpoint_auth_method
  const authMethodRaw =
    typeof body.token_endpoint_auth_method === 'string'
      ? body.token_endpoint_auth_method
      : 'none'
  if (authMethodRaw !== 'none' && authMethodRaw !== 'client_secret_post') {
    return jsonError(
      c,
      400,
      'invalid_client_metadata',
      `unsupported token_endpoint_auth_method: ${authMethodRaw}`,
    )
  }
  const isConfidential = authMethodRaw === 'client_secret_post'

  // Advisory scope at registration (per-flow scope is what binds).
  const registeredScope =
    typeof body.scope === 'string'
      ? sanitizeScopes(body.scope).join(' ')
      : OAUTH_ISSUABLE_SCOPES.join(' ')

  // Mint identifiers.
  const clientId = randomHex(16) // 32 hex chars
  const clientSecret = isConfidential ? randomHex(32) : null
  const clientSecretHash = clientSecret ? await sha256Hex(clientSecret) : null

  db.insert(oauthClients)
    .values({
      client_id: clientId,
      client_secret_hash: clientSecretHash,
      client_name: clientName,
      redirect_uris: JSON.stringify(redirectUris),
      grant_types: grantTypes.join(','),
      token_endpoint_auth_method: authMethodRaw,
      scope: registeredScope,
    })
    .run()

  const issuedAt = Math.floor(Date.now() / 1000)
  const out: Record<string, unknown> = {
    client_id: clientId,
    client_id_issued_at: issuedAt,
    client_name: clientName,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: ['code'],
    token_endpoint_auth_method: authMethodRaw,
    scope: registeredScope,
  }
  if (clientSecret) {
    out.client_secret = clientSecret
    // Per RFC 7591 §3.2.1, omitting client_secret_expires_at OR setting
    // it to 0 means "does not expire". We're explicit about the latter.
    out.client_secret_expires_at = 0
  }
  return c.json(out, 201)
})

// -- authorize -----------------------------------------------------------

// Step 1 of the flow. Validate the request, ensure the user is signed in,
// stash the request server-side under a request_id, and 302 the browser
// to the SPA consent screen at /oauth/consent?request_id=…
oauthRoutes.get('/authorize', async (c) => {
  const q = c.req.query()
  const clientId = q.client_id
  const redirectUri = q.redirect_uri
  const responseType = q.response_type
  const codeChallenge = q.code_challenge
  const codeChallengeMethod = q.code_challenge_method || 'S256'
  const scopeParam = q.scope
  const stateParam = q.state || null
  // resource: RFC 8707, included by spec-compliant MCP clients so we know
  // exactly which protected resource they're targeting. We don't pin it
  // strictly (there's only one resource we serve), but we accept and
  // ignore it rather than 400'ing.
  // const _resource = q.resource

  // We cannot redirect to the client until we've validated client_id AND
  // redirect_uri — those are the trust anchors. Any failure before that
  // point is a hard 400.
  if (!clientId) return c.text('missing client_id', 400)
  if (!redirectUri) return c.text('missing redirect_uri', 400)
  const client = db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.client_id, clientId))
    .get()
  if (!client) return c.text('unknown client_id', 400)
  const registered = parseRegisteredRedirectUris(client.redirect_uris)
  if (!registered.includes(redirectUri)) {
    return c.text('redirect_uri does not match any registered URI for this client', 400)
  }

  // From here on we have a trusted redirect_uri; bounce errors back to it.
  if (responseType !== 'code') {
    return c.redirect(
      clientErrorRedirect(
        redirectUri,
        'unsupported_response_type',
        `response_type must be "code", got "${responseType ?? ''}"`,
        stateParam,
      ),
    )
  }
  if (codeChallengeMethod !== 'S256') {
    return c.redirect(
      clientErrorRedirect(
        redirectUri,
        'invalid_request',
        'code_challenge_method must be S256',
        stateParam,
      ),
    )
  }
  if (!codeChallenge || !/^[A-Za-z0-9\-_]{43,128}$/.test(codeChallenge)) {
    return c.redirect(
      clientErrorRedirect(
        redirectUri,
        'invalid_request',
        'code_challenge missing or malformed (base64url, 43-128 chars)',
        stateParam,
      ),
    )
  }

  const scopes = sanitizeScopes(scopeParam)
  if (scopes.length === 0) {
    return c.redirect(
      clientErrorRedirect(
        redirectUri,
        'invalid_scope',
        'no requested scope is supported by this server',
        stateParam,
      ),
    )
  }

  // Auth gate: must be signed in. If not, bounce through OIDC; user
  // returns to this same URL with cookies attached.
  const userId = await requireOauthSession(c)
  if (userId === null) {
    const here = new URL(c.req.url)
    const target = `/auth/login?return=${encodeURIComponent(here.pathname + here.search)}`
    return c.redirect(target)
  }

  // Stash the request server-side under an opaque request_id. The consent
  // SPA reads back via /oauth/consent-context and POSTs the decision.
  const requestId = randomHex(16)
  const expiresAt = new Date(
    Date.now() + PENDING_CONSENT_TTL_SECONDS * 1000,
  ).toISOString()
  db.insert(oauthPendingConsent)
    .values({
      request_id: requestId,
      user_id: userId,
      expires_at: expiresAt,
      params_json: JSON.stringify({
        client_id: clientId,
        redirect_uri: redirectUri,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        scopes,
        state: stateParam,
      }),
    })
    .run()

  // Best-effort GC. ISO 8601 sorts lexicographically.
  db.delete(oauthPendingConsent)
    .where(lt(oauthPendingConsent.expires_at, new Date().toISOString()))
    .run()

  return c.redirect(`/oauth/consent?request_id=${encodeURIComponent(requestId)}`)
})

// -- consent context (SPA) ----------------------------------------------

// Session-gated. Returns the pending request's display data so the
// consent screen can render. Returns 404 (not 401) if request is gone
// so a leaked request_id doesn't differentiate "expired" from "wrong
// user" from "wrong session".
oauthRoutes.get('/consent-context', async (c) => {
  const userId = await requireOauthSession(c)
  if (userId === null) {
    return jsonError(c, 401, 'unauthorized', 'session required')
  }
  const requestId = c.req.query('request_id')
  if (!requestId) return jsonError(c, 400, 'invalid_request', 'request_id required')

  const row = db
    .select()
    .from(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .get()
  if (!row) return jsonError(c, 404, 'not_found', 'pending request not found')
  if (row.user_id !== userId)
    return jsonError(c, 404, 'not_found', 'pending request not found')
  if (Date.parse(row.expires_at) < Date.now()) {
    db.delete(oauthPendingConsent)
      .where(eq(oauthPendingConsent.request_id, requestId))
      .run()
    return jsonError(c, 404, 'not_found', 'pending request expired')
  }
  const params = JSON.parse(row.params_json) as {
    client_id: string
    redirect_uri: string
    scopes: OauthScope[]
    state: string | null
  }
  const client = db
    .select({ client_name: oauthClients.client_name })
    .from(oauthClients)
    .where(eq(oauthClients.client_id, params.client_id))
    .get()
  const user = db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get()
  return c.json({
    request_id: requestId,
    client_name: client?.client_name ?? 'Unknown application',
    client_id: params.client_id,
    redirect_uri: params.redirect_uri,
    scopes: params.scopes,
    user_email: user?.email ?? '',
  })
})

// -- consent decision ----------------------------------------------------

// Session-gated. Body: { request_id, approve }. On approve, mint an auth
// code and redirect the browser to the client's redirect_uri with
// ?code=…&state=…. On deny, redirect with ?error=access_denied&state=….
//
// We return the redirect target as JSON (rather than 302) because the
// SPA fetches this from JS — letting the browser follow a 302 from a
// fetch would either be opaque (mode: 'cors') or unobservable. The SPA
// then sets window.location to the returned URL.
oauthRoutes.post('/consent', async (c) => {
  const userId = await requireOauthSession(c)
  if (userId === null) {
    return jsonError(c, 401, 'unauthorized', 'session required')
  }
  let body: { request_id?: unknown; approve?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return jsonError(c, 400, 'invalid_request', 'JSON body required')
  }
  const requestId = typeof body.request_id === 'string' ? body.request_id : ''
  if (!requestId) return jsonError(c, 400, 'invalid_request', 'request_id required')
  const approve = body.approve === true

  const row = db
    .select()
    .from(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .get()
  if (!row) return jsonError(c, 404, 'not_found', 'pending request not found')
  if (row.user_id !== userId)
    return jsonError(c, 404, 'not_found', 'pending request not found')
  if (Date.parse(row.expires_at) < Date.now()) {
    db.delete(oauthPendingConsent)
      .where(eq(oauthPendingConsent.request_id, requestId))
      .run()
    return jsonError(c, 404, 'not_found', 'pending request expired')
  }

  // One-shot: delete the pending row regardless of decision so it can't
  // be replayed.
  db.delete(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .run()

  const params = JSON.parse(row.params_json) as {
    client_id: string
    redirect_uri: string
    code_challenge: string
    scopes: OauthScope[]
    state: string | null
  }

  if (!approve) {
    return c.json({
      redirect: clientErrorRedirect(
        params.redirect_uri,
        'access_denied',
        'user denied the request',
        params.state,
      ),
    })
  }

  // Mint the authorization code (single-use, 60s TTL).
  const rawCode = randomHex(32)
  const codeHash = await sha256Hex(rawCode)
  const codeExpires = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000).toISOString()
  db.insert(oauthAuthorizationCodes)
    .values({
      code_hash: codeHash,
      user_id: userId,
      client_id: params.client_id,
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      scopes: params.scopes.join(','),
      expires_at: codeExpires,
    })
    .run()

  const u = new URL(params.redirect_uri)
  u.searchParams.set('code', rawCode)
  if (params.state) u.searchParams.set('state', params.state)
  return c.json({ redirect: u.toString() })
})

// -- token ---------------------------------------------------------------

// POST /oauth/token  — two grants:
//   - authorization_code (with PKCE)
//   - refresh_token (rotating; old refresh is revoked on use)
//
// Body is application/x-www-form-urlencoded per spec. We tolerate JSON
// too since some clients are sloppy.
oauthRoutes.post('/token', async (c) => {
  const params = await parseTokenBody(c)
  if (!params) {
    return jsonError(c, 400, 'invalid_request', 'unparseable request body')
  }
  // Cache-Control per RFC 6749 §5.1: token responses must not be cached.
  c.header('Cache-Control', 'no-store')
  c.header('Pragma', 'no-cache')

  const grantType = params.get('grant_type')
  if (grantType === 'authorization_code') {
    return handleAuthorizationCodeGrant(c, params)
  }
  if (grantType === 'refresh_token') {
    return handleRefreshTokenGrant(c, params)
  }
  return jsonError(c, 400, 'unsupported_grant_type', `unsupported grant_type: ${grantType ?? ''}`)
})

async function parseTokenBody(c: Context): Promise<URLSearchParams | null> {
  const ct = (c.req.header('content-type') || '').toLowerCase()
  try {
    if (ct.includes('application/json')) {
      const j = (await c.req.json()) as Record<string, unknown>
      const sp = new URLSearchParams()
      for (const [k, v] of Object.entries(j)) {
        if (typeof v === 'string') sp.set(k, v)
      }
      return sp
    }
    const text = await c.req.text()
    return new URLSearchParams(text)
  } catch {
    return null
  }
}

async function authenticateClient(
  c: Context,
  params: URLSearchParams,
): Promise<
  | { ok: true; client: typeof oauthClients.$inferSelect }
  | { ok: false; status: number; error: string; description: string }
> {
  const clientId = params.get('client_id') || ''
  if (!clientId) {
    return { ok: false, status: 400, error: 'invalid_client', description: 'missing client_id' }
  }
  const client = db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.client_id, clientId))
    .get()
  if (!client) {
    return { ok: false, status: 401, error: 'invalid_client', description: 'unknown client_id' }
  }
  if (client.token_endpoint_auth_method === 'client_secret_post') {
    const secret = params.get('client_secret') || ''
    if (!secret) {
      return {
        ok: false,
        status: 401,
        error: 'invalid_client',
        description: 'client_secret required',
      }
    }
    const wantHash = await sha256Hex(secret)
    if (!client.client_secret_hash || wantHash !== client.client_secret_hash) {
      return {
        ok: false,
        status: 401,
        error: 'invalid_client',
        description: 'client_secret mismatch',
      }
    }
  } else {
    // Public client. The spec says public clients MAY pass client_id in
    // the body; we already pulled it. Nothing else to verify.
  }
  return { ok: true, client }
}

async function handleAuthorizationCodeGrant(c: Context, params: URLSearchParams) {
  const authed = await authenticateClient(c, params)
  if (!authed.ok) return jsonError(c, authed.status, authed.error, authed.description)
  const client = authed.client

  const code = params.get('code') || ''
  const redirectUri = params.get('redirect_uri') || ''
  const codeVerifier = params.get('code_verifier') || ''
  if (!code) return jsonError(c, 400, 'invalid_request', 'missing code')
  if (!redirectUri) return jsonError(c, 400, 'invalid_request', 'missing redirect_uri')
  if (!codeVerifier || !PKCE_RE.test(codeVerifier)) {
    return jsonError(c, 400, 'invalid_grant', 'missing or malformed code_verifier')
  }

  const codeHash = await sha256Hex(code)
  const row = db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.code_hash, codeHash))
    .get()
  if (!row) return jsonError(c, 400, 'invalid_grant', 'unknown or already-redeemed code')

  // Single-use enforcement. If the code was already redeemed, this is a
  // replay — treat it as a compromise indicator and additionally revoke
  // any tokens issued under this code's client/user pair? Spec says we
  // SHOULD; for v1 we just refuse.
  if (row.redeemed_at) {
    return jsonError(c, 400, 'invalid_grant', 'authorization code already redeemed')
  }
  if (Date.parse(row.expires_at) < Date.now()) {
    db.delete(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code_hash, codeHash))
      .run()
    return jsonError(c, 400, 'invalid_grant', 'authorization code expired')
  }
  if (row.client_id !== client.client_id) {
    return jsonError(c, 400, 'invalid_grant', 'code/client mismatch')
  }
  if (row.redirect_uri !== redirectUri) {
    return jsonError(c, 400, 'invalid_grant', 'redirect_uri mismatch')
  }

  const verifierChallenge = await s256(codeVerifier)
  if (verifierChallenge !== row.code_challenge) {
    return jsonError(c, 400, 'invalid_grant', 'PKCE verifier does not match challenge')
  }

  // Mark redeemed. Single-use.
  db.update(oauthAuthorizationCodes)
    .set({ redeemed_at: new Date().toISOString() })
    .where(eq(oauthAuthorizationCodes.code_hash, codeHash))
    .run()

  const scopes = row.scopes.split(',').filter(Boolean) as OauthScope[]
  const issued = await issueTokenPair(row.user_id, client.client_id, scopes)
  return c.json(issued)
}

async function handleRefreshTokenGrant(c: Context, params: URLSearchParams) {
  const authed = await authenticateClient(c, params)
  if (!authed.ok) return jsonError(c, authed.status, authed.error, authed.description)
  const client = authed.client

  const refresh = params.get('refresh_token') || ''
  if (!refresh) return jsonError(c, 400, 'invalid_request', 'missing refresh_token')
  const refreshHash = await sha256Hex(refresh)
  const row = db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.refresh_token_hash, refreshHash))
    .get()
  if (!row) return jsonError(c, 400, 'invalid_grant', 'unknown refresh_token')
  if (row.revoked_at) return jsonError(c, 400, 'invalid_grant', 'refresh_token revoked')
  if (row.client_id !== client.client_id)
    return jsonError(c, 400, 'invalid_grant', 'refresh_token/client mismatch')
  if (
    row.refresh_expires_at &&
    Date.parse(row.refresh_expires_at) < Date.now()
  ) {
    db.update(oauthAccessTokens)
      .set({ revoked_at: new Date().toISOString() })
      .where(eq(oauthAccessTokens.id, row.id))
      .run()
    return jsonError(c, 400, 'invalid_grant', 'refresh_token expired')
  }

  // Optionally narrow scope (RFC 6749 §6). We accept either an absent
  // `scope` param (reuse the existing scopes) or a subset of them.
  const requestedScope = params.get('scope')
  let scopes = row.scopes.split(',').filter(Boolean) as OauthScope[]
  if (requestedScope) {
    const narrowed = sanitizeScopes(requestedScope)
    if (!narrowed.every((s) => scopes.includes(s))) {
      return jsonError(c, 400, 'invalid_scope', 'requested scope exceeds original grant')
    }
    if (narrowed.length === 0) {
      return jsonError(c, 400, 'invalid_scope', 'no valid scopes in refresh request')
    }
    scopes = narrowed
  }

  // Rotate. Revoke the row that owned this refresh token; issue a fresh
  // pair.
  db.update(oauthAccessTokens)
    .set({ revoked_at: new Date().toISOString() })
    .where(eq(oauthAccessTokens.id, row.id))
    .run()

  const issued = await issueTokenPair(row.user_id, client.client_id, scopes)
  return c.json(issued)
}

async function issueTokenPair(
  userId: number,
  clientId: string,
  scopes: OauthScope[],
): Promise<{
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  scope: string
}> {
  const rawAccess = ACCESS_TOKEN_PREFIX + randomHex(32)
  const rawRefresh = REFRESH_TOKEN_PREFIX + randomHex(32)
  const accessHash = await sha256Hex(rawAccess)
  const refreshHash = await sha256Hex(rawRefresh)
  const expiresAt = new Date(
    Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
  ).toISOString()
  const refreshExpiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
  ).toISOString()
  db.insert(oauthAccessTokens)
    .values({
      token_hash: accessHash,
      refresh_token_hash: refreshHash,
      user_id: userId,
      client_id: clientId,
      scopes: scopes.join(','),
      expires_at: expiresAt,
      refresh_expires_at: refreshExpiresAt,
    })
    .run()
  return {
    access_token: rawAccess,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: rawRefresh,
    scope: scopes.join(' '),
  }
}

// -- revoke --------------------------------------------------------------

// RFC 7009. Always returns 200 (per spec) regardless of whether the
// token was known — leaking that distinction is a fingerprinting risk.
oauthRoutes.post('/revoke', async (c) => {
  const params = await parseTokenBody(c)
  if (!params) return c.body(null, 200)
  c.header('Cache-Control', 'no-store')
  const token = params.get('token')
  if (!token) return c.body(null, 200)
  // Optional `token_type_hint` — we don't really need it because we hash
  // and look up both columns; left here for spec completeness.
  // const _hint = params.get('token_type_hint')
  const hash = await sha256Hex(token)
  // Match either as access or refresh token.
  const rowByAccess = db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.token_hash, hash))
    .get()
  const rowByRefresh = rowByAccess
    ? null
    : db
        .select()
        .from(oauthAccessTokens)
        .where(eq(oauthAccessTokens.refresh_token_hash, hash))
        .get()
  const row = rowByAccess || rowByRefresh
  if (row && !row.revoked_at) {
    db.update(oauthAccessTokens)
      .set({ revoked_at: new Date().toISOString() })
      .where(eq(oauthAccessTokens.id, row.id))
      .run()
  }
  return c.body(null, 200)
})

// ----- helpers exported to auth.ts ---------------------------------------

// Resolve an `oa_*` bearer token to user/scopes for the request middleware.
// Mirrors the pt_* lookup in auth.ts:lookupTokenUser. Returns null for
// missing/expired/revoked tokens so the caller can fall through to other
// auth methods.
export async function lookupOauthToken(raw: string): Promise<{
  userId: number
  scopes: Scope[]
  tokenId: number
} | null> {
  const hash = await sha256Hex(raw)
  const row = db
    .select({
      id: oauthAccessTokens.id,
      user_id: oauthAccessTokens.user_id,
      scopes: oauthAccessTokens.scopes,
      expires_at: oauthAccessTokens.expires_at,
      revoked_at: oauthAccessTokens.revoked_at,
    })
    .from(oauthAccessTokens)
    .where(and(eq(oauthAccessTokens.token_hash, hash), isNull(oauthAccessTokens.revoked_at)))
    .get()
  if (!row) return null
  if (Date.parse(row.expires_at) < Date.now()) return null
  const scopes = row.scopes
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s): s is OauthScope =>
      (OAUTH_ISSUABLE_SCOPES as readonly string[]).includes(s),
    ) as Scope[]
  return { userId: row.user_id, scopes, tokenId: row.id }
}
