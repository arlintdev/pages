// Deterministic gradient generator for page card heroes.
//
// The Linear/Vercel mock uses bespoke gradients per page (a wedding
// page is dusty rose, a pricing page is graphite, a portfolio is sand).
// In a real catalog we can't curate every gradient by hand — and we
// don't want them to shuffle on every reload — so we hash the page id
// to pick from a curated palette. Two effects: each page gets a stable
// identity in the grid, and the grid as a whole looks intentional
// rather than randomly tinted.

const PALETTE: { from: string; to: string; via?: string; iconBlend: 'overlay' | 'screen' }[] = [
  // dusty rose / wedding
  { from: '#FCE7E2', via: '#F5C6D0', to: '#9F4E5C', iconBlend: 'overlay' },
  // graphite / pricing
  { from: '#0A0A0A', to: '#1F1F1F', iconBlend: 'screen' },
  // sand / portfolio
  { from: '#F0EBE0', to: '#D6CDB6', iconBlend: 'overlay' },
  // plum / party
  { from: '#1A1A2E', via: '#3D2B5E', to: '#7A4FB8', iconBlend: 'screen' },
  // espresso / menu
  { from: '#3D2516', to: '#7A4A2B', iconBlend: 'screen' },
  // gold / recipe
  { from: '#FAF3E0', to: '#E8C97A', iconBlend: 'overlay' },
  // forest / books
  { from: '#2A4A3E', to: '#4A7A66', iconBlend: 'screen' },
  // silver / resume
  { from: '#F4F4F4', to: '#D4D4D4', iconBlend: 'overlay' },
  // arctic
  { from: '#E0EAF5', to: '#7090B8', iconBlend: 'overlay' },
  // citrus
  { from: '#FFE9D0', to: '#E07A4F', iconBlend: 'overlay' },
  // moss
  { from: '#E5EDD5', to: '#6B8C4A', iconBlend: 'overlay' },
  // sapphire
  { from: '#1A2E4A', to: '#4F7AB8', iconBlend: 'screen' },
]

// FNV-1a 32-bit hash. Cheap, deterministic, distributes integers and
// short strings well enough for palette bucketing.
function hash(input: string | number): number {
  const s = String(input)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function gradientFor(seed: string | number): {
  background: string
  iconBlend: string
} {
  const p = PALETTE[hash(seed) % PALETTE.length]
  const stops = p.via ? `${p.from}, ${p.via} 60%, ${p.to}` : `${p.from}, ${p.to}`
  return {
    background: `linear-gradient(135deg, ${stops})`,
    iconBlend: p.iconBlend,
  }
}

// Glyph for the card icon. Curated set of monospace-ish symbols so cards
// have variety without resorting to per-page icons. Same hash bucketing.
const GLYPHS = ['♡', '$', '◆', '✦', '◷', '◯', '▢', 'A', '◐', '✿', '◇', '☼', '●', '◈', '▲']

export function glyphFor(seed: string | number, fallback: string): string {
  const first = fallback.trim().charAt(0).toUpperCase()
  if (first && /[A-Z0-9]/.test(first)) return first
  return GLYPHS[hash(seed) % GLYPHS.length]
}
