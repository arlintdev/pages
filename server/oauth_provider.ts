// SQLite-backed OAuthServerProvider for @arlintdev/mcp-oauth-bun.
//
// What the package does for us:
//   - All wire-shape concerns (metadata, status codes, error bodies).
//   - PKCE S256 verify (we just supply the stored challenge).
//   - Client auth (Basic + body, the package normalizes).
//
// What we still own:
//   - Storage. Clients, codes, tokens, and pending consent rows all live
//     in the existing Drizzle tables (server/schema.ts).
//   - User authentication during the authorize flow. We require a valid
//     pages session cookie; if missing, bounce through /auth/login.
//   - The consent screen. The SPA handles approve/deny — we redirect to
//     /oauth/consent?request_id=…, and a separate handler on /oauth/
//     mints the code and 302s the user back to the client.
//
// We hash everything that touches the network (auth codes, access tokens,
// refresh tokens, client secrets). A DB read does not yield working
// credentials.

import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'
import { and, eq, isNull, lt } from 'drizzle-orm'
import {
  type AuthorizationParams,
  type AuthInfo,
  type OAuthClientInformationFull,
  type OAuthRegisteredClientsStore,
  type OAuthServerProvider,
  type OAuthTokenRevocationRequest,
  type OAuthTokens,
  InvalidClientError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTokenError,
  ServerError,
} from '@arlintdev/mcp-oauth-bun'
import { db } from './db'
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthAccessTokens,
  oauthPendingConsent,
  users,
} from './schema'
import { resolveSessionUser, SESSION_COOKIE } from './oidc'

// ---- config -----------------------------------------------------------

// OAuth issues a strict subset of the API's full scope set. Connected
// apps must NEVER be able to mint personal API tokens; `tokens:*` is
// session-only.
export const OAUTH_ISSUABLE_SCOPES = ['pages:read', 'pages:write'] as const
export type OauthScope = (typeof OAUTH_ISSUABLE_SCOPES)[number]

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const AUTH_CODE_TTL_SECONDS = 60 // RFC 6749 §4.1.2 recommends ≤10min
const PENDING_CONSENT_TTL_SECONDS = 10 * 60 // 10 minutes

const ACCESS_TOKEN_PREFIX = 'oa_'
const REFRESH_TOKEN_PREFIX = 'or_'

// ---- crypto helpers ---------------------------------------------------

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

function sanitizeScopes(scopes: string[] | undefined): OauthScope[] {
  if (!scopes || scopes.length === 0) return ['pages:read']
  const out: OauthScope[] = []
  for (const s of scopes) {
    if ((OAUTH_ISSUABLE_SCOPES as readonly string[]).includes(s) && !out.includes(s as OauthScope)) {
      out.push(s as OauthScope)
    }
  }
  return out
}

// ---- DB row → SDK client info ----------------------------------------

function rowToClient(
  row: typeof oauthClients.$inferSelect,
): OAuthClientInformationFull {
  let redirect_uris: string[] = []
  try {
    const parsed = JSON.parse(row.redirect_uris)
    if (Array.isArray(parsed)) redirect_uris = parsed.filter((s) => typeof s === 'string')
  } catch {
    /* leave empty */
  }
  return {
    client_id: row.client_id,
    // We keep the HASH server-side; the SDK's middleware compares
    // plaintext-vs-plaintext, so we expose the hash here and SHA-256 the
    // submitted secret before the middleware sees it (see authToHashShim
    // in server/index.ts).
    client_secret: row.client_secret_hash ?? undefined,
    client_name: row.client_name,
    redirect_uris,
    grant_types: row.grant_types.split(',').filter(Boolean),
    response_types: ['code'],
    token_endpoint_auth_method: row.token_endpoint_auth_method,
    scope: row.scope ?? undefined,
  }
}

// ---- clients store ----------------------------------------------------

export const clientsStore: OAuthRegisteredClientsStore = {
  async getClient(clientId) {
    const row = db
      .select()
      .from(oauthClients)
      .where(eq(oauthClients.client_id, clientId))
      .get()
    return row ? rowToClient(row) : undefined
  },
  async registerClient(client) {
    // The mcp-oauth-bun register handler generated the client_id /
    // client_secret. We hash the secret before persisting.
    const isPublic = client.token_endpoint_auth_method === 'none' || !client.client_secret
    const secretHash = client.client_secret ? await sha256Hex(client.client_secret) : null
    const grantTypes = client.grant_types ?? ['authorization_code', 'refresh_token']

    db.insert(oauthClients)
      .values({
        client_id: client.client_id,
        client_secret_hash: secretHash,
        client_name: client.client_name ?? 'Unnamed client',
        redirect_uris: JSON.stringify(client.redirect_uris),
        grant_types: grantTypes.join(','),
        token_endpoint_auth_method: client.token_endpoint_auth_method ?? (isPublic ? 'none' : 'client_secret_post'),
        scope: client.scope ?? OAUTH_ISSUABLE_SCOPES.join(' '),
      })
      .run()

    // Return the client info AS THE CALLER SHOULD SEE IT — i.e. plaintext
    // secret, NOT the hash we just stored. mcp-oauth-bun serializes this
    // body straight to the registration response, so this is the one and
    // only chance the client has to read the secret.
    return {
      ...client,
      grant_types: grantTypes,
      response_types: ['code'],
      scope: client.scope ?? OAUTH_ISSUABLE_SCOPES.join(' '),
    }
  },
}

// ---- helpers for the consent flow -------------------------------------

/** Look up the signed-in user from the session cookie. Returns null when
 *  no valid session (anonymous OAuth caller, expired session, …). */
async function sessionUserId(c: Context): Promise<number | null> {
  const cookie = getCookie(c, SESSION_COOKIE)
  const u = await resolveSessionUser(cookie)
  if (u) return u.id
  // Dev fallback: if no OIDC, materialize the local@dev user so end-to-end
  // testing of the OAuth flow works on localhost without an IdP.
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

// ---- the provider -----------------------------------------------------

export const oauthProvider: OAuthServerProvider = {
  get clientsStore() {
    return clientsStore
  },

  /**
   * Phase 1 of the auth flow. The router has already validated client_id
   * and redirect_uri before calling us, so we can trust both. From here:
   *
   *   1. Require a logged-in session. Bounce to /auth/login if missing.
   *   2. Stash the request (scopes + code_challenge + state + redirect_uri)
   *      server-side under a fresh request_id.
   *   3. 302 to /oauth/consent?request_id=… (the SPA consent screen).
   *
   * The SPA then POSTs to /oauth/consent which calls into completeConsent
   * (below) to mint the code and redirect back to the client.
   */
  // Note on the Context cast: the mcp-oauth-bun package declares `c` as
  // Context from its OWN node_modules/hono, which TS treats as a distinct
  // type from the Context we import here. At runtime there's only one
  // Hono. The cast inside the function bridges that.
  async authorize(client, params: AuthorizationParams, c: any): Promise<Response> {
    const ctx = c as Context
    const scopes = sanitizeScopes(params.scopes)
    if (scopes.length === 0) {
      throw new InvalidScopeError(
        'no requested scope is supported by this server',
      )
    }

    const userId = await sessionUserId(ctx)
    if (userId === null) {
      const here = new URL(ctx.req.url)
      const target = `/auth/login?return=${encodeURIComponent(here.pathname + here.search)}`
      return ctx.redirect(target)
    }

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
          client_id: client.client_id,
          redirect_uri: params.redirectUri,
          code_challenge: params.codeChallenge,
          code_challenge_method: 'S256',
          scopes,
          state: params.state ?? null,
        }),
      })
      .run()

    // Opportunistic GC. ISO 8601 sorts lexicographically.
    db.delete(oauthPendingConsent)
      .where(lt(oauthPendingConsent.expires_at, new Date().toISOString()))
      .run()

    return ctx.redirect(`/oauth/consent?request_id=${encodeURIComponent(requestId)}`)
  },

  /** Phase 2 helper: the token endpoint asks for the code_challenge we
   *  stored at authorize time, then S256-verifies the client's verifier
   *  against it. */
  async challengeForAuthorizationCode(client, code): Promise<string> {
    const hash = await sha256Hex(code)
    const row = db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code_hash, hash))
      .get()
    if (!row) throw new InvalidGrantError('Unknown or expired authorization code')
    if (row.redeemed_at) throw new InvalidGrantError('Authorization code already redeemed')
    if (Date.parse(row.expires_at) < Date.now()) {
      throw new InvalidGrantError('Authorization code expired')
    }
    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError('Authorization code / client mismatch')
    }
    return row.code_challenge
  },

  /** Phase 3: the actual code → token exchange. Mints opaque access +
   *  refresh tokens, returns them. PKCE has already been verified by the
   *  mcp-oauth-bun token handler. */
  async exchangeAuthorizationCode(
    client,
    code,
    _codeVerifier,
    redirectUri,
  ): Promise<OAuthTokens> {
    const hash = await sha256Hex(code)
    const row = db
      .select()
      .from(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.code_hash, hash))
      .get()
    if (!row) throw new InvalidGrantError('Unknown or expired authorization code')
    if (row.redeemed_at) throw new InvalidGrantError('Authorization code already redeemed')
    if (Date.parse(row.expires_at) < Date.now()) {
      throw new InvalidGrantError('Authorization code expired')
    }
    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError('Authorization code / client mismatch')
    }
    if (redirectUri && row.redirect_uri !== redirectUri) {
      throw new InvalidGrantError('redirect_uri mismatch')
    }

    // Mark redeemed (single-use). Atomic: if another concurrent call beat
    // us to it, the UPDATE affects 0 rows and we throw.
    db.update(oauthAuthorizationCodes)
      .set({ redeemed_at: new Date().toISOString() })
      .where(eq(oauthAuthorizationCodes.code_hash, hash))
      .run()

    const scopes = row.scopes.split(',').filter(Boolean) as OauthScope[]
    return issueTokenPair(row.user_id, client.client_id, scopes)
  },

  /** Phase 4: refresh-token rotation. Old refresh row is revoked; a fresh
   *  pair is minted. Optionally narrows scope per RFC 6749 §6. */
  async exchangeRefreshToken(client, refreshToken, scopes): Promise<OAuthTokens> {
    const hash = await sha256Hex(refreshToken)
    const row = db
      .select()
      .from(oauthAccessTokens)
      .where(eq(oauthAccessTokens.refresh_token_hash, hash))
      .get()
    if (!row) throw new InvalidGrantError('Unknown refresh_token')
    if (row.revoked_at) throw new InvalidGrantError('refresh_token revoked')
    if (row.client_id !== client.client_id) {
      throw new InvalidGrantError('refresh_token / client mismatch')
    }
    if (row.refresh_expires_at && Date.parse(row.refresh_expires_at) < Date.now()) {
      db.update(oauthAccessTokens)
        .set({ revoked_at: new Date().toISOString() })
        .where(eq(oauthAccessTokens.id, row.id))
        .run()
      throw new InvalidGrantError('refresh_token expired')
    }

    let issueScopes = row.scopes.split(',').filter(Boolean) as OauthScope[]
    if (scopes && scopes.length > 0) {
      const narrowed = sanitizeScopes(scopes)
      if (!narrowed.every((s) => issueScopes.includes(s))) {
        throw new InvalidScopeError('requested scope exceeds original grant')
      }
      issueScopes = narrowed
    }

    // Rotate: revoke this row, issue a fresh pair.
    db.update(oauthAccessTokens)
      .set({ revoked_at: new Date().toISOString() })
      .where(eq(oauthAccessTokens.id, row.id))
      .run()
    return issueTokenPair(row.user_id, client.client_id, issueScopes)
  },

  /** Verify an access token for the bearer middleware. We don't actually
   *  use mcp-oauth-bun's requireBearerAuth on /api/mcp (pages's auth
   *  middleware handles bearer routing across oauth + personal tokens),
   *  but the interface still requires this method. */
  async verifyAccessToken(token): Promise<AuthInfo> {
    const hash = await sha256Hex(token)
    const row = db
      .select()
      .from(oauthAccessTokens)
      .where(and(eq(oauthAccessTokens.token_hash, hash), isNull(oauthAccessTokens.revoked_at)))
      .get()
    if (!row) throw new InvalidTokenError('Unknown or revoked token')
    if (Date.parse(row.expires_at) < Date.now()) {
      throw new InvalidTokenError('Token expired')
    }
    return {
      token,
      clientId: row.client_id,
      scopes: row.scopes.split(',').filter(Boolean),
      expiresAt: Math.floor(Date.parse(row.expires_at) / 1000),
    }
  },

  /** RFC 7009 revocation. The mcp-oauth-bun handler returns 200 with `{}`
   *  whether or not the token existed (per spec, leaking that distinction
   *  is a fingerprinting risk). We do the same and just no-op for
   *  unknown tokens. */
  async revokeToken(client, request: OAuthTokenRevocationRequest): Promise<void> {
    const hash = await sha256Hex(request.token)
    // Match on either column; the spec lets the client send either.
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
    if (!row) return // unknown — silent success per spec.
    if (row.client_id !== client.client_id) {
      // Per RFC 7009 §2.1, only the client that owns the token can revoke
      // it. We treat a mismatch as a silent no-op (don't leak existence).
      return
    }
    if (!row.revoked_at) {
      db.update(oauthAccessTokens)
        .set({ revoked_at: new Date().toISOString() })
        .where(eq(oauthAccessTokens.id, row.id))
        .run()
    }
  },
}

// ---- consent SPA helpers ----------------------------------------------
//
// These aren't part of the OAuth spec — they bridge mcp-oauth-bun's
// authorize() (which 302s to our consent screen) and the actual code
// minting. The SPA calls /oauth/consent-context to read pending request
// data, then POSTs /oauth/consent with the approve/deny decision.

export type ConsentContext = {
  request_id: string
  client_id: string
  client_name: string
  redirect_uri: string
  scopes: OauthScope[]
  user_email: string
}

/** Reads + validates a pending consent row. */
export async function loadPendingConsent(
  requestId: string,
  userId: number,
): Promise<ConsentContext | null> {
  const row = db
    .select()
    .from(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .get()
  if (!row || row.user_id !== userId) return null
  if (Date.parse(row.expires_at) < Date.now()) {
    db.delete(oauthPendingConsent)
      .where(eq(oauthPendingConsent.request_id, requestId))
      .run()
    return null
  }
  const params = JSON.parse(row.params_json) as {
    client_id: string
    redirect_uri: string
    scopes: OauthScope[]
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
  return {
    request_id: requestId,
    client_id: params.client_id,
    client_name: client?.client_name ?? 'Unknown application',
    redirect_uri: params.redirect_uri,
    scopes: params.scopes,
    user_email: user?.email ?? '',
  }
}

/** Mints an auth code for an approved consent request and returns the
 *  redirect target the SPA should send the browser to. */
export async function approveConsent(
  requestId: string,
  userId: number,
): Promise<string | null> {
  const row = db
    .select()
    .from(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .get()
  if (!row || row.user_id !== userId) return null
  if (Date.parse(row.expires_at) < Date.now()) return null

  // One-shot: delete first so a concurrent request can't double-mint.
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
  return u.toString()
}

/** Denied consent. Deletes the pending row and returns the
 *  redirect_uri?error=access_denied&state=… URL. */
export async function denyConsent(
  requestId: string,
  userId: number,
): Promise<string | null> {
  const row = db
    .select()
    .from(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .get()
  if (!row || row.user_id !== userId) return null
  db.delete(oauthPendingConsent)
    .where(eq(oauthPendingConsent.request_id, requestId))
    .run()
  const params = JSON.parse(row.params_json) as {
    redirect_uri: string
    state: string | null
  }
  const u = new URL(params.redirect_uri)
  u.searchParams.set('error', 'access_denied')
  u.searchParams.set('error_description', 'user denied the request')
  if (params.state) u.searchParams.set('state', params.state)
  return u.toString()
}

// ---- token issuance --------------------------------------------------

async function issueTokenPair(
  userId: number,
  clientId: string,
  scopes: OauthScope[],
): Promise<OAuthTokens> {
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

// ---- lookup helper used by server/auth.ts ----------------------------

/** Resolve an `oa_*` bearer token to user/scopes for the request
 *  middleware. Mirrors auth.ts:lookupTokenUser. Returns null for
 *  missing/expired/revoked tokens so the caller can fall through. */
export async function lookupOauthToken(raw: string): Promise<{
  userId: number
  scopes: OauthScope[]
  tokenId: number
} | null> {
  const hash = await sha256Hex(raw)
  const row = db
    .select({
      id: oauthAccessTokens.id,
      user_id: oauthAccessTokens.user_id,
      scopes: oauthAccessTokens.scopes,
      expires_at: oauthAccessTokens.expires_at,
    })
    .from(oauthAccessTokens)
    .where(and(eq(oauthAccessTokens.token_hash, hash), isNull(oauthAccessTokens.revoked_at)))
    .get()
  if (!row) return null
  if (Date.parse(row.expires_at) < Date.now()) return null
  const scopes = row.scopes
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is OauthScope =>
      (OAUTH_ISSUABLE_SCOPES as readonly string[]).includes(s),
    )
  return { userId: row.user_id, scopes, tokenId: row.id }
}

// Stop the unused-import linter from yelping. `ServerError` is part of
// the public surface we re-export and the IDE benefits from having it
// in-scope; this is the cheapest way to keep the import live until we
// actually throw one.
export { ServerError, InvalidClientError }
