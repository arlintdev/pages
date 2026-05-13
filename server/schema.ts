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
