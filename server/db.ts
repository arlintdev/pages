import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './schema'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

const dbPath = process.env.DB_PATH || './data/app.db'
mkdirSync(dirname(dbPath), { recursive: true })

const sqlite = new Database(dbPath)
sqlite.exec('PRAGMA journal_mode = WAL')
sqlite.exec('PRAGMA foreign_keys = ON')

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    name TEXT,
    oidc_subject TEXT,
    last_login_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL DEFAULT '',
    html TEXT NOT NULL,
    share_token TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS pages_user_idx ON pages(user_id);
  CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    token_prefix TEXT NOT NULL,
    scopes TEXT NOT NULL,
    expires_at TEXT,
    last_used_at TEXT,
    revoked_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS api_tokens_user_idx ON api_tokens(user_id);
  CREATE TABLE IF NOT EXISTS custom_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    summary TEXT NOT NULL,
    when_to_use TEXT NOT NULL,
    html TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS custom_styles_user_idx ON custom_styles(user_id);
  CREATE UNIQUE INDEX IF NOT EXISTS custom_styles_user_name_unique ON custom_styles(user_id, name);
`)

// Legacy tables from the multi-file-site era. Drop on startup; the data
// model is now one HTML doc per row in `pages`.
sqlite.exec(`DROP TABLE IF EXISTS files;`)
sqlite.exec(`DROP TABLE IF EXISTS sites;`)

// Best-effort additive migrations. SQLite has no IF NOT EXISTS for ADD
// COLUMN so we swallow the "duplicate column" error.
for (const col of ['oidc_subject TEXT', 'last_login_at TEXT', 'username TEXT']) {
  try {
    sqlite.exec(`ALTER TABLE users ADD COLUMN ${col}`)
  } catch {
    /* column already present */
  }
}
try {
  sqlite.exec(`ALTER TABLE pages ADD COLUMN slug TEXT NOT NULL DEFAULT ''`)
} catch {
  /* present */
}
// Session table is wiped on every process start. Reasons:
//
//   1) Migration: tokens used to be stored as plaintext, now they're
//      SHA-256 hashes — old rows would no longer match the lookup path
//      anyway, so deleting them on the first hashed-cookie boot is
//      necessary for correctness.
//
//   2) Posture: keeping the behaviour for every subsequent restart
//      bounds the lifetime of any leaked session cookie to a single
//      process uptime. Cookie value stays a 30-day cookie in the
//      user's browser, but it goes stale the moment we restart — they
//      sign in again. For a small homelab service this is a fine
//      tradeoff; for a service with sticky users, replace this with a
//      one-shot marker (e.g. a `meta` table row) so only the first
//      hashed-cookie boot wipes the table.
sqlite.exec(`DELETE FROM sessions`)
// Backfill: users without a username yet, derive one from their email.
{
  const taken = new Set(
    sqlite
      .query<{ username: string }, []>(`SELECT username FROM users WHERE username IS NOT NULL`)
      .all()
      .map((r) => r.username),
  )
  const rows = sqlite
    .query<{ id: number; email: string }, []>(
      `SELECT id, email FROM users WHERE username IS NULL OR username = ''`,
    )
    .all()
  const update = sqlite.prepare(`UPDATE users SET username = ? WHERE id = ?`)
  for (const r of rows) {
    let base = slugify(r.email.split('@')[0] || `user${r.id}`)
    if (!base) base = `user${r.id}`
    let candidate = base
    let n = 1
    while (taken.has(candidate)) {
      n += 1
      candidate = `${base}-${n}`
    }
    taken.add(candidate)
    update.run(candidate, r.id)
  }
}
// Backfill: pages without a slug yet, derive from title with per-user
// collision-avoidance.
{
  type R = { id: number; user_id: number; title: string }
  const rows = sqlite
    .query<R, []>(`SELECT id, user_id, title FROM pages WHERE slug = '' OR slug IS NULL`)
    .all()
  const existing = sqlite.prepare<{ slug: string }, [number, string]>(
    `SELECT slug FROM pages WHERE user_id = ? AND slug = ?`,
  )
  const update = sqlite.prepare<unknown, [string, number]>(
    `UPDATE pages SET slug = ? WHERE id = ?`,
  )
  for (const r of rows) {
    const base = slugify(r.title) || `page-${r.id}`
    let candidate = base
    let n = 1
    while (existing.get(r.user_id, candidate)) {
      n += 1
      candidate = `${base}-${n}`
    }
    update.run(candidate, r.id)
  }
}
// Now that every row has a slug, enforce the per-user uniqueness index.
sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS pages_user_slug_unique ON pages(user_id, slug);`)

// Tiny local copy of slugify so this module doesn't depend on others.
function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || ''
  )
}

export const db = drizzle(sqlite, { schema })
