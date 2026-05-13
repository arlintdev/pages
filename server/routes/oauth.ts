// OAuth 2.1 authorization server for MCP clients.
//
// Wire-shape concerns (metadata docs, error bodies, status codes, PKCE
// S256 verification, the RFC 7591 DCR handler) are owned by
// @arlintdev/mcp-oauth-bun. Storage and the user-facing consent flow are
// ours.
//
// We don't use the package's `mcpAuthRouter` wholesale because:
//
//   1. Its `authenticateClient` middleware does plaintext-vs-plaintext
//      secret comparison; we store SHA-256 hashes, so we need a custom
//      auth middleware that hashes the submitted secret first.
//
//   2. We want the .well-known/* discovery paths mounted at the app
//      root (RFC 8414 / 9728 require root-path discovery), not under
//      /oauth/. The package can serve them either way, but mounting
//      separately keeps server/index.ts honest about which routes are
//      OAuth surface.
//
// So we wire the individual handlers manually here.
//
// Endpoints mounted under /oauth:
//
//   GET\|POST /authorize         (package authorizationHandler)
//   POST     /token              (custom client auth + package tokenHandler)
//   POST     /register           (package clientRegistrationHandler)
//   POST     /revoke             (custom client auth + package revocationHandler)
//   GET      /consent-context    (pages: SPA reads pending request data)
//   POST     /consent            (pages: SPA approve/deny → 302)
//
// Scopes issued by OAuth are deliberately limited to pages:read and
// pages:write — connected apps must NOT be able to mint personal API
// tokens. See oauth_provider.ts.

import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  allowedMethods,
  readFormOrJson,
  authorizationHandler,
  tokenHandler,
  revocationHandler,
  clientRegistrationHandler,
  type McpAuthRouterOptions,
  type McpOauthVars,
  InvalidClientError,
  InvalidRequestError,
  OAuthError,
  ServerError,
} from '@arlintdev/mcp-oauth-bun'
import {
  oauthProvider,
  OAUTH_ISSUABLE_SCOPES,
  loadPendingConsent,
  approveConsent,
  denyConsent,
} from '../oauth_provider'
import { resolveSessionUser, SESSION_COOKIE } from '../oidc'
import { db } from '../db'
import { users } from '../schema'
import { eq } from 'drizzle-orm'

// ----- public base URL ---------------------------------------------------

/** Canonical externally-reachable base URL. Used for the issuer claim in
 *  AS metadata and for the absolute URLs in PRM. MUST match what the
 *  caller sees or MCP clients will reject the flow ("issuer mismatch"). */
export function publicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    'https://pages.arlint.dev'
  )
}

// ----- mcp-oauth-bun config ---------------------------------------------

function routerOptions(): McpAuthRouterOptions {
  const base = publicBaseUrl()
  return {
    provider: oauthProvider,
    issuerUrl: new URL(base),
    resourceUrl: new URL('/api/mcp', base),
    baseUrl: new URL('/oauth/', base),
    scopesSupported: [...OAUTH_ISSUABLE_SCOPES],
    bearerMethodsSupported: ['header'],
  }
}

// ----- discovery metadata handlers --------------------------------------
//
// Exported so server/index.ts can mount them at the standard .well-known
// paths AT THE APP ROOT (RFC 8414 + RFC 9728 require root-path discovery).

export function authorizationServerMetadataHandler(c: Context) {
  return c.json(buildAuthorizationServerMetadata(routerOptions()))
}

export function protectedResourceMetadataHandler(c: Context) {
  return c.json(buildProtectedResourceMetadata(routerOptions()))
}

// ----- hashed-secret client auth middleware ----------------------------
//
// Replacement for the package's authenticateClient. The package compares
// `client.client_secret` byte-for-byte to the submitted secret; we hash
// the submitted secret first because our DB stores SHA-256 hashes (the
// provider returns the hash in client_secret).
//
// On success we set c.var.client AND cache the parsed body under the
// same `__body` key the package's readFormOrJson uses, so the downstream
// tokenHandler / revocationHandler re-use the parse rather than re-
// reading the body.

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function parseBasicAuth(header: string | undefined): {
  clientId?: string
  clientSecret?: string
} {
  if (!header) return {}
  const lower = header.trim().toLowerCase()
  if (!lower.startsWith('basic ')) return {}
  try {
    const decoded = atob(header.trim().slice(6).trim())
    const idx = decoded.indexOf(':')
    if (idx < 0) return {}
    return {
      clientId: decodeURIComponent(decoded.slice(0, idx)),
      clientSecret: decodeURIComponent(decoded.slice(idx + 1)),
    }
  } catch {
    return {}
  }
}

function jsonError(err: OAuthError, fallbackStatus = 400): Response {
  const status =
    err instanceof ServerError
      ? 500
      : err instanceof InvalidClientError
      ? 401
      : fallbackStatus
  return new Response(JSON.stringify(err.toResponseObject()), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const hashedAuthenticateClient: MiddlewareHandler<{ Variables: McpOauthVars }> = async (
  c,
  next,
) => {
  try {
    const body = (await readFormOrJson(c)) as Record<string, unknown>
    const basic = parseBasicAuth(c.req.header('authorization'))

    const clientId =
      basic.clientId ?? (typeof body.client_id === 'string' ? body.client_id : '')
    const clientSecret =
      basic.clientSecret ??
      (typeof body.client_secret === 'string' ? body.client_secret : undefined)

    if (!clientId) {
      throw new InvalidRequestError('client_id is required')
    }
    const client = await oauthProvider.clientsStore.getClient(clientId)
    if (!client) throw new InvalidClientError('Invalid client_id')

    // client.client_secret is the SHA-256 HASH (the provider returns the
    // hash in this field on purpose, so the comparison is hash-vs-hash).
    if (client.client_secret) {
      if (!clientSecret) throw new InvalidClientError('Client secret is required')
      const incomingHash = await sha256Hex(clientSecret)
      if (incomingHash !== client.client_secret) {
        throw new InvalidClientError('Invalid client_secret')
      }
      if (
        client.client_secret_expires_at &&
        client.client_secret_expires_at !== 0 &&
        client.client_secret_expires_at < Math.floor(Date.now() / 1000)
      ) {
        throw new InvalidClientError('Client secret has expired')
      }
    }

    c.set('client', client)
    ;(c as any).__body = body
    return next()
  } catch (err) {
    if (err instanceof InvalidClientError) return jsonError(err, 401)
    if (err instanceof OAuthError) return jsonError(err, 400)
    return jsonError(new ServerError('Internal Server Error'), 500)
  }
}

// ----- main router -------------------------------------------------------

export const oauthRoutes = new Hono<{ Variables: McpOauthVars }>()

// /authorize — both GET and POST (RFC 6749 §3.1 allows POST; some MCP
// clients prefer it). Delegates to provider.authorize via the package's
// authorizationHandler which already implements the two-phase error
// handling (pre-redirect 400 vs post-redirect bounce).
oauthRoutes.on(
  ['GET', 'POST'],
  '/authorize',
  authorizationHandler({ provider: oauthProvider }),
)
oauthRoutes.all('/authorize', allowedMethods(['GET', 'POST']))

// /token — client auth (hashed) then the package's tokenHandler.
oauthRoutes.post(
  '/token',
  hashedAuthenticateClient,
  tokenHandler({ provider: oauthProvider }),
)
oauthRoutes.all('/token', allowedMethods(['POST']))

// /register — DCR. No client auth (the whole point is registering one).
oauthRoutes.post(
  '/register',
  clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }),
)
oauthRoutes.all('/register', allowedMethods(['POST']))

// /revoke — client auth (hashed) then the package's revocationHandler.
oauthRoutes.post(
  '/revoke',
  hashedAuthenticateClient,
  revocationHandler({ provider: oauthProvider }),
)
oauthRoutes.all('/revoke', allowedMethods(['POST']))

// ----- consent SPA helpers ---------------------------------------------
//
// Pages-specific endpoints the SPA uses to render the consent screen and
// post the user's approve/deny decision. Not part of any OAuth spec.

async function sessionUserId(c: Context): Promise<number | null> {
  const cookie = getCookie(c, SESSION_COOKIE)
  const u = await resolveSessionUser(cookie)
  if (u) return u.id
  // Dev fallback: localhost development with no OIDC configured.
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

oauthRoutes.get('/consent-context', async (c) => {
  const userId = await sessionUserId(c)
  if (userId === null) {
    return c.json({ error: 'unauthorized', error_description: 'session required' }, 401)
  }
  const requestId = c.req.query('request_id')
  if (!requestId) {
    return c.json({ error: 'invalid_request', error_description: 'request_id required' }, 400)
  }
  const ctx = await loadPendingConsent(requestId, userId)
  if (!ctx) {
    return c.json({ error: 'not_found', error_description: 'pending request not found' }, 404)
  }
  return c.json(ctx)
})

oauthRoutes.post('/consent', async (c) => {
  const userId = await sessionUserId(c)
  if (userId === null) {
    return c.json({ error: 'unauthorized', error_description: 'session required' }, 401)
  }
  let body: { request_id?: unknown; approve?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_request', error_description: 'JSON body required' }, 400)
  }
  const requestId = typeof body.request_id === 'string' ? body.request_id : ''
  if (!requestId) {
    return c.json({ error: 'invalid_request', error_description: 'request_id required' }, 400)
  }
  const approve = body.approve === true

  const target = approve
    ? await approveConsent(requestId, userId)
    : await denyConsent(requestId, userId)
  if (!target) {
    return c.json({ error: 'not_found', error_description: 'pending request not found' }, 404)
  }
  return c.json({ redirect: target })
})

// ----- re-exports used by server/auth.ts ---------------------------------

export { lookupOauthToken } from '../oauth_provider'
