import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/bun'
import { db } from './db'
import { pages, users } from './schema'
import { eq, and } from 'drizzle-orm'
import { pageRoutes } from './routes/pages'
import { tokenRoutes } from './routes/tokens'
import { customStyleRoutes } from './routes/custom_styles'
import {
  oauthRoutes,
  protectedResourceMetadataHandler,
  authorizationServerMetadataHandler,
  publicBaseUrl,
} from './routes/oauth'
import { authMiddleware, requireScope, requireSession, type AuthVars } from './auth'
import { handleMCPRequest } from './mcp'
import { loginHandler, callbackHandler, logoutHandler, oidcEnabled } from './oidc'
import { STYLES, findStyle } from './styles'
import { USER_HTML_HEADERS } from './headers'

const app = new Hono<{ Variables: AuthVars }>()

if (process.env.NODE_ENV !== 'production') {
  app.use('/api/*', cors())
}

// OIDC sign-in routes. Registered before the auth middleware so anonymous
// visitors can reach them.
app.get('/auth/login', loginHandler)
app.get('/auth/callback', callbackHandler)
app.post('/auth/logout', logoutHandler)
app.get('/auth/status', (c) => c.json({ oidc_enabled: oidcEnabled() }))

// OAuth 2.1 authorization server for MCP clients.
//
// Discovery documents (RFC 8414 + RFC 9728) live under /.well-known —
// these MUST be reachable without any auth or other gating so client
// implementations can fetch them blind. The MCP spec also requires PRM
// to be reachable at the resource path (i.e. /api/mcp's PRM lives at
// /.well-known/oauth-protected-resource/api/mcp); some older clients
// fall back to the root /.well-known/oauth-protected-resource, so we
// serve the same document at both.
app.get('/.well-known/oauth-authorization-server', authorizationServerMetadataHandler)
app.get('/.well-known/oauth-protected-resource', protectedResourceMetadataHandler)
app.get('/.well-known/oauth-protected-resource/api/mcp', protectedResourceMetadataHandler)

// /oauth/* — the rest of the flow (DCR, authorize, token, revoke, +
// consent helpers used by the SPA). The router itself is session-aware
// where needed; we do NOT put it behind the api/* authMiddleware because
// /oauth/authorize and /oauth/token are reached without app auth.
app.route('/oauth', oauthRoutes)

// Public share path — the only unauthenticated content route.
//
// Shape: /p/<username>/<slug>/<token>
//
// All three components must match a row in (users.username, pages.slug,
// pages.share_token) — and share_token can't be NULL. Any mismatch
// returns 404 (not 401 / 403) so we don't leak whether the user, slug,
// or token specifically was wrong.
//
// We inject a small "Shared from <host>" badge fixed to the top-right of
// the rendered document. The badge is injected before </body> (or
// appended if no </body> tag is present) so it sits on top of the page's
// own content.
app.get('/p/:username/:slug/:token', (c) => {
  const username = c.req.param('username')
  const slug = c.req.param('slug')
  const token = c.req.param('token')
  if (!username || !slug || !token) return c.text('Not found', 404)

  const row = db
    .select({ html: pages.html, share_token: pages.share_token })
    .from(pages)
    .innerJoin(users, eq(users.id, pages.user_id))
    .where(
      and(
        eq(users.username, username),
        eq(pages.slug, slug),
        eq(pages.share_token, token),
      ),
    )
    .get()
  if (!row || !row.share_token) return c.text('Not found', 404)

  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') || ''
  const homeUrl = base || '/'
  const hostLabel = base ? new URL(base).host : 'pages'
  const overlay = renderShareOverlay(homeUrl, hostLabel)
  const body = injectBeforeBodyClose(row.html, overlay)

  return new Response(body, {
    headers: {
      ...USER_HTML_HEADERS,
      // Don't let intermediaries cache a shared page — revocation needs
      // to take effect immediately. `private` is a belt-and-braces hint
      // for any in-between proxy not to share the cached response.
      'cache-control': 'no-store, private',
    },
  })
})

// renderShareOverlay returns a self-contained <style>+<a> block. Scoped
// via the `.pages-share-overlay` class and isolated with `all: revert`
// inside, so it inherits browser defaults and ignores the page's CSS
// reset. target=_blank so the badge opens the catalog in a new tab and
// doesn't navigate away from whatever the visitor was reading.
function renderShareOverlay(homeUrl: string, hostLabel: string): string {
  return `
<style>
  .pages-share-overlay {
    all: revert;
    position: fixed !important;
    top: 12px !important;
    right: 12px !important;
    z-index: 2147483647 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    padding: 6px 10px !important;
    background: rgba(11, 13, 16, 0.82) !important;
    color: #e6e9ee !important;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 999px !important;
    font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    text-decoration: none !important;
    backdrop-filter: blur(6px) !important;
    -webkit-backdrop-filter: blur(6px) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
    transition: opacity 0.15s ease, transform 0.15s ease !important;
    opacity: 0.85 !important;
  }
  .pages-share-overlay:hover {
    opacity: 1 !important;
    transform: translateY(-1px) !important;
  }
  .pages-share-overlay svg {
    flex: 0 0 auto !important;
  }
  .pages-share-overlay .pages-share-host {
    color: #a78bfa !important;
  }
  @media print {
    .pages-share-overlay { display: none !important; }
  }
</style>
<a class="pages-share-overlay" href="${escapeAttr(homeUrl)}" target="_blank" rel="noopener" title="Shared via pages — open the catalog">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7"/><path d="M10 14L21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></svg>
  <span>Shared from <span class="pages-share-host">${escapeText(hostLabel)}</span></span>
</a>
`.trim()
}

function injectBeforeBodyClose(html: string, snippet: string): string {
  // Replace only the last </body> so nested literal "</body>" strings in
  // <script>/<style> blocks aren't mistaken for the real closing tag.
  const lower = html.toLowerCase()
  const idx = lower.lastIndexOf('</body>')
  if (idx === -1) return html + snippet
  return html.slice(0, idx) + snippet + html.slice(idx)
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// MCP-specific 401 enrichment. The MCP spec requires that an
// unauthenticated request to the resource come back with a
// WWW-Authenticate header pointing at the Protected Resource Metadata
// URL — that's how clients auto-discover the auth server without any
// out-of-band config. We register this BEFORE the standard auth
// middleware (which would otherwise return a bare JSON 401) so the
// MCP-pathed routes get the right header set on the 401 path.
//
// We don't wrap successful responses — the auth middleware short-circuits
// only on failure, so this middleware just intercepts that response and
// stamps the header.
app.use('/api/mcp', async (c, next) => {
  await next()
  if (c.res.status === 401) {
    const prmUrl = `${publicBaseUrl()}/.well-known/oauth-protected-resource/api/mcp`
    // Hono freezes c.res; clone with new headers attached.
    const cloned = new Response(c.res.body, c.res)
    cloned.headers.set(
      'WWW-Authenticate',
      `Bearer realm="pages", resource_metadata="${prmUrl}"`,
    )
    c.res = cloned
  }
})
app.use('/api/mcp/*', async (c, next) => {
  await next()
  if (c.res.status === 401) {
    const prmUrl = `${publicBaseUrl()}/.well-known/oauth-protected-resource/api/mcp`
    const cloned = new Response(c.res.body, c.res)
    cloned.headers.set(
      'WWW-Authenticate',
      `Bearer realm="pages", resource_metadata="${prmUrl}"`,
    )
    c.res = cloned
  }
})

app.use('/api/*', authMiddleware())

app.all('/api/mcp', requireScope('pages:read'), (c) => handleMCPRequest(c.get('user'), c.req.raw))
app.all('/api/mcp/*', requireScope('pages:read'), (c) => handleMCPRequest(c.get('user'), c.req.raw))

app.get('/api/me', (c) => {
  const u = c.get('user')
  return c.json({
    id: u.id,
    email: u.email,
    scopes: u.scopes,
    auth_method: u.authMethod,
  })
})

// Token CRUD — session-only so a leaked bearer can't mint siblings.
app.route(
  '/api/tokens',
  new Hono<{ Variables: AuthVars }>().use('*', requireSession()).route('/', tokenRoutes),
)

// Page CRUD — GET requires pages:read, anything mutating requires
// pages:write. Session callers (the UI) carry wildcard scope so these
// guards are no-ops for them.
const pageGate = async (c: any, next: any) => {
  const want = c.req.method === 'GET' ? 'pages:read' : 'pages:write'
  return requireScope(want)(c, next)
}
app.use('/api/pages', pageGate)
app.use('/api/pages/*', pageGate)
app.route('/api/pages', pageRoutes)

// Style catalogue. Same content the MCP `list_styles` tool serves, exposed
// over JSON for the /styles UI view. No scope check — the catalogue is
// the same for every authenticated user.
app.get('/api/styles', (c) => {
  return c.json(
    STYLES.map((s) => ({
      name: s.name,
      summary: s.summary,
      when_to_use: s.when_to_use,
    })),
  )
})

// Full style record by name, including the starter_html shell. The
// example_html is intentionally NOT inlined here — the UI iframes
// /api/styles/:name/preview directly so the browser handles caching.
app.get('/api/styles/:name', (c) => {
  const s = findStyle(c.req.param('name'))
  if (!s) return c.json({ error: 'not found' }, 404)
  return c.json({
    name: s.name,
    summary: s.summary,
    when_to_use: s.when_to_use,
    starter_html: s.starter_html,
  })
})

// Renders the example HTML directly as text/html so the /styles view can
// preview it inside a sandboxed iframe. Lives under /api/* so it sits
// behind auth like every other UI-facing route. Built-in styles are
// server-controlled so this is "safe HTML" in the trust sense, but we
// still apply USER_HTML_HEADERS so the iframe behaviour is identical
// across built-in and custom previews (the styles UI hosts both).
app.get('/api/styles/:name/preview', (c) => {
  const s = findStyle(c.req.param('name'))
  if (!s) return c.text('not found', 404)
  return new Response(s.example_html, {
    headers: {
      ...USER_HTML_HEADERS,
      // Styles only change on deploy — let the browser hold the preview
      // for a few minutes between catalog visits.
      'cache-control': 'private, max-age=300',
    },
  })
})

// Per-user custom styles. Authenticated; the routes themselves filter
// by user_id so callers only see/edit their own.
app.route('/api/custom-styles', customStyleRoutes)

// Anything under /p/ that didn't match the share route above is a dead
// link — register a 404 before the SPA fallback so old share URLs don't
// silently bounce visitors into the catalog login flow.
app.all('/p', (c) => c.text('Not found', 404))
app.all('/p/*', (c) => c.text('Not found', 404))

if (process.env.NODE_ENV === 'production') {
  app.use('/*', serveStatic({ root: './dist' }))
  app.get('/*', serveStatic({ path: './dist/index.html' }))
}

// Refuse to start an unsafe production server. In production, the
// authMiddleware's dev fallback (which silently creates a `local@dev`
// user with `*` scope) would mean any anonymous request gets admin-
// level access — almost certainly not what the operator wanted. Better
// to crash loudly than to listen and leak.
if (process.env.NODE_ENV === 'production' && !oidcEnabled()) {
  console.error(
    'FATAL: NODE_ENV=production but OIDC is not configured. Set ' +
      'OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, and ' +
      'OIDC_REDIRECT_URL. See .env.example.',
  )
  process.exit(1)
}

const port = Number(process.env.PORT) || 3000
console.log(`Server running on :${port}`)

export default { port, fetch: app.fetch }
