// Shared resource limits. Keep these in one place so the HTTP routes,
// MCP tools, and any future bulk-import paths all agree on what's too
// big — divergence here causes 4xx-on-one-path-200-on-another bugs.

/**
 * Maximum HTML document size, in bytes. Applies to:
 *   - POST /api/pages       (the `html` field)
 *   - PUT  /api/pages/:id   (the `html` field)
 *   - MCP  create_page      (the `html` argument)
 *   - MCP  update_page      (the `html` argument)
 *
 * 20 MiB. SQLite handles documents this size without complaint; the
 * primary cost is the response payload on /api/pages/:id (which sends
 * the html back). A static export from a build tool can easily top 5MB,
 * so 20MB gives plenty of headroom without inviting abuse.
 */
export const MAX_HTML_BYTES = 20 * 1024 * 1024
export const MAX_HTML_LABEL = `${MAX_HTML_BYTES / 1024 / 1024}MB`
