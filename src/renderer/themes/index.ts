/**
 * themes/index.ts - Theme registry and apply helper.
 *
 * ThemeDef and THEMES are defined in @shared/types so the main-process menu
 * builder can also import them without a cross-boundary renderer import.
 * This module re-exports them plus the renderer-specific applyTheme function.
 *
 * Switching is done by setting document.documentElement.dataset.theme to the
 * theme id. All theme CSS files are bundled and imported in main.tsx; the
 * data-theme attribute on <html> selects the active token set via attribute
 * selectors defined in each theme file:
 *
 *   github.css  :root { ... }                - default (no attribute needed)
 *   night.css   [data-theme="night"] { ... } - dark theme
 *   sepia.css   [data-theme="sepia"] { ... } - warm light theme
 *
 * Switching is instant and global because all CSS is already loaded.
 */
export type { ThemeDef } from '@shared/types'
export { THEMES } from '@shared/types'

import { THEMES } from '@shared/types'

/** Set of valid theme ids for fast O(1) lookup. */
const THEME_IDS = new Set(THEMES.map((t) => t.id))

/**
 * Apply a theme by updating document.documentElement.dataset.theme.
 *
 * Unknown ids fall back silently to 'github' so a stale settings value
 * never leaves the UI in an undefined state.
 */
export function applyTheme(id: string): void {
  const resolved = THEME_IDS.has(id) ? id : 'github'
  // Set the data-theme attribute on <html>. All CSS files loaded in main.tsx
  // use this attribute to select the correct token overrides. Setting it on
  // documentElement (not document.body) ensures :root selectors also match.
  document.documentElement.dataset['theme'] = resolved
}
