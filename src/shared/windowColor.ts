/**
 * Window-color marker helpers (pure, shared by main + renderer).
 *
 * A window can be tagged with a solid color (rendered as a thin top rail) to
 * tell multiple Lekha windows apart - typically one color per project folder.
 * The color is a raw `#rrggbb` hex applied outside the theme token system, so
 * it looks identical on every theme.
 */

/** One curated swatch: a stable id + its hex, for the picker UI + persistence. */
export interface WindowColorSwatch {
  id: string
  label: string
  hex: string
}

/**
 * The curated palette shown in the color picker. Vivid mid-tones chosen to
 * stay distinguishable as a 4px rail on both light and dark themes.
 */
export const WINDOW_COLOR_SWATCHES: readonly WindowColorSwatch[] = [
  { id: 'red', label: 'Red', hex: '#e5484d' },
  { id: 'orange', label: 'Orange', hex: '#e8590c' },
  { id: 'amber', label: 'Amber', hex: '#d9a40e' },
  { id: 'green', label: 'Green', hex: '#46a758' },
  { id: 'teal', label: 'Teal', hex: '#0d9488' },
  { id: 'blue', label: 'Blue', hex: '#3b82f6' },
  { id: 'violet', label: 'Violet', hex: '#7c5cfc' },
  { id: 'pink', label: 'Pink', hex: '#e93d82' },
]

const HEX_RE = /^#[0-9a-f]{6}$/

/**
 * Validate and canonicalize a window-color value. Accepts a `#rgb` or `#rrggbb`
 * hex (case-insensitive), returns a lowercased `#rrggbb`; returns null for
 * null/empty/malformed input (corrupt persisted values, unsupported formats).
 */
export function normalizeWindowColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  let v = raw.trim().toLowerCase()
  if (v.length === 0) return null
  // Expand shorthand #rgb -> #rrggbb.
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (short) v = `#${short[1]!}${short[1]!}${short[2]!}${short[2]!}${short[3]!}${short[3]!}`
  return HEX_RE.test(v) ? v : null
}
