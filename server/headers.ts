// Headers applied to every response that serves user-authored HTML.
//
// CSP `sandbox` puts the response into an opaque origin so any scripts
// inside it cannot reach back into /api/* with the visitor's session
// cookie. `allow-scripts` keeps JS-driven styles working (slides deck
// nav, terminal animations); the opaque origin is what blocks the
// fetch('/api/*') exfiltration path.
//
// `allow-popups` + `allow-popups-to-escape-sandbox` lets the "Shared
// from pages.arlint.dev" overlay open the catalog in a new tab as a
// normal, un-sandboxed page (otherwise the catalog popup would inherit
// our sandbox and break).
//
// We DON'T grant allow-same-origin. That's the bit that, combined with
// allow-scripts, would re-enable the same-origin XSS vector.
export const USER_HTML_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy':
    "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'",
  // Belt-and-braces — even browsers that ignore CSP `sandbox` should
  // refuse to expose this response cross-origin.
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}
