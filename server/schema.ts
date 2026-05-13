import { sqliteTable, integer, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').unique().notNull(),
  // Public handle used in share URLs (e.g. /p/<username>/<slug>). Derived
  // from the email's local part on first sign-in, slugified, with a
  // numeric suffix appended if it collides with another user's username.
  username: text('username').unique(),
  name: text('name'),
  oidc_subject: text('oidc_subject'),
  last_login_at: text('last_login_at'),
  created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
})

export const sessions = sqliteTable(
  'sessions',
  {
    token: text('token').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expires_at: text('expires_at').notNull(),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byUser: index('sessions_user_idx').on(t.user_id),
  }),
)

export const pages = sqliteTable(
  'pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // Slug derived from title, unique per user. Renaming the page updates
    // both — collision is resolved at insert time, not on the share URL.
    slug: text('slug').notNull(),
    html: text('html').notNull(),
    // Per-page secret carried as ?auth=<token>. NULL = page not shared.
    // Rotate by calling /share again; old token immediately stops working.
    share_token: text('share_token'),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byUser: index('pages_user_idx').on(t.user_id),
    uniqueUserSlug: uniqueIndex('pages_user_slug_unique').on(t.user_id, t.slug),
  }),
)

// User-authored style presets. Lives alongside the built-in catalogue in
// styles.ts — the MCP/UI merge the two so agents (and the user) can pick
// from either. Each user owns their own; names must be unique per user
// and must not shadow a built-in style name (validation lives in the
// route handler, not the constraint).
export const customStyles = sqliteTable(
  'custom_styles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    summary: text('summary').notNull(),
    when_to_use: text('when_to_use').notNull(),
    html: text('html').notNull(),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
    updated_at: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byUser: index('custom_styles_user_idx').on(t.user_id),
    uniqueUserName: uniqueIndex('custom_styles_user_name_unique').on(t.user_id, t.name),
  }),
)

export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    token_hash: text('token_hash').notNull().unique(),
    token_prefix: text('token_prefix').notNull(),
    scopes: text('scopes').notNull(),
    expires_at: text('expires_at'),
    last_used_at: text('last_used_at'),
    revoked_at: text('revoked_at'),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byUser: index('api_tokens_user_idx').on(t.user_id),
  }),
)

// OAuth 2.1 dynamic-client-registration. Clients register at
// POST /oauth/register and persist here. `client_id` is the public opaque
// identifier; `client_secret_hash` is SHA-256(secret) for confidential
// clients and NULL for public PKCE clients (token_endpoint_auth_method
// = "none"). `redirect_uris` is stored as a JSON-encoded array of strings;
// the authorize endpoint matches exactly against this list.
export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    client_id: text('client_id').notNull().unique(),
    client_secret_hash: text('client_secret_hash'),
    client_name: text('client_name').notNull(),
    redirect_uris: text('redirect_uris').notNull(),
    grant_types: text('grant_types').notNull(),
    token_endpoint_auth_method: text('token_endpoint_auth_method').notNull(),
    scope: text('scope'),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byClientId: index('oauth_clients_client_id_idx').on(t.client_id),
  }),
)

// One-shot authorization codes. Single-use; redeemed_at marks consumed.
// 60-second TTL enforced at issuance time (expires_at). Hashed (SHA-256)
// so a DB read does not yield working codes.
export const oauthAuthorizationCodes = sqliteTable(
  'oauth_authorization_codes',
  {
    code_hash: text('code_hash').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    client_id: text('client_id').notNull(),
    redirect_uri: text('redirect_uri').notNull(),
    code_challenge: text('code_challenge').notNull(),
    scopes: text('scopes').notNull(),
    expires_at: text('expires_at').notNull(),
    redeemed_at: text('redeemed_at'),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
)

// Opaque access + refresh tokens minted by /oauth/token. Both hashed.
// Refresh tokens rotate on each redemption (the redeemed row gets
// revoked_at set). Lookups by SHA-256(raw); raw values never persisted.
export const oauthAccessTokens = sqliteTable(
  'oauth_access_tokens',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    token_hash: text('token_hash').notNull().unique(),
    refresh_token_hash: text('refresh_token_hash').unique(),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    client_id: text('client_id').notNull(),
    scopes: text('scopes').notNull(),
    expires_at: text('expires_at').notNull(),
    refresh_expires_at: text('refresh_expires_at'),
    revoked_at: text('revoked_at'),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => ({
    byUser: index('oauth_access_tokens_user_idx').on(t.user_id),
  }),
)

// Pending consent requests. The /oauth/authorize endpoint stores a row
// here keyed by an opaque random `request_id`, then 302s to the SPA at
// /oauth/consent?request_id=…. The consent screen reads back via the
// /oauth/consent-context endpoint and POSTs the approve/deny decision.
// Session-gated by `user_id` so only the user who started the flow can
// act on it. 10-minute TTL.
export const oauthPendingConsent = sqliteTable(
  'oauth_pending_consent',
  {
    request_id: text('request_id').primaryKey(),
    user_id: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    params_json: text('params_json').notNull(),
    expires_at: text('expires_at').notNull(),
    created_at: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Page = typeof pages.$inferSelect
export type NewPage = typeof pages.$inferInsert
export type ApiToken = typeof apiTokens.$inferSelect
export type NewApiToken = typeof apiTokens.$inferInsert
export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
export type CustomStyle = typeof customStyles.$inferSelect
export type NewCustomStyle = typeof customStyles.$inferInsert
export type OauthClient = typeof oauthClients.$inferSelect
export type NewOauthClient = typeof oauthClients.$inferInsert
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect
export type NewOauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferInsert
export type OauthAccessToken = typeof oauthAccessTokens.$inferSelect
export type NewOauthAccessToken = typeof oauthAccessTokens.$inferInsert
export type OauthPendingConsent = typeof oauthPendingConsent.$inferSelect
export type NewOauthPendingConsent = typeof oauthPendingConsent.$inferInsert
