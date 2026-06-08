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

import { THEMES, migrateThemeId, type ThemeDef, type UserTheme } from '@shared/types'

/** Set of built-in theme ids for fast O(1) lookup. */
const THEME_IDS = new Set(THEMES.map((t) => t.id))

/**
 * Map of theme id -> light/dark nature, covering built-in THEMES and any
 * currently-injected user themes. Built-in entries are seeded once; user
 * entries are (re)populated by injectUserThemes. Exposed via themeTypeFor so
 * non-CSS consumers (e.g. the mermaid wrapper) can resolve a theme's nature
 * from the live registry instead of duplicating the dark/light list.
 */
const themeTypes = new Map<string, 'dark' | 'light'>(
  THEMES.map((t) => [t.id, t.type ?? 'light'] as const),
)

/**
 * Resolve a theme id's light/dark nature from the registry (built-in THEMES +
 * injected user themes). Returns undefined for unknown ids so callers can
 * decide their own fallback.
 */
export function themeTypeFor(id: string | undefined): 'dark' | 'light' | undefined {
  return id === undefined ? undefined : themeTypes.get(id)
}

/**
 * Ids of user-authored themes currently injected. Maintained by
 * injectUserThemes so applyTheme accepts them too. Switching to a user id that
 * is later removed falls back to 'github' (see applyTheme).
 */
const userThemeIds = new Set<string>()

/** Attribute marking the managed <style> element that holds user theme CSS. */
const USER_THEME_STYLE_ATTR = 'data-user-themes'

/**
 * Neutralize any closing `</style>` sequence in user CSS so it cannot break out
 * of the injected <style> element (defense-in-depth; textContent already avoids
 * HTML parsing, but this keeps serialized output safe too). Case-insensitive.
 */
export function escapeStyleCss(css: string): string {
  return css.replace(/<\/(style)/gi, '<\\/$1')
}

/**
 * Inject the given user themes' CSS into a single managed <style> element in
 * <head> and register their ids so applyTheme accepts them. Idempotent: calling
 * again replaces the previous content (used by Reload Themes).
 */
export function injectUserThemes(themes: UserTheme[]): void {
  // Drop the previous user-theme type registrations, then re-seed from the
  // incoming set. Built-in entries are never removed (they are not in
  // userThemeIds), so this only prunes stale user themes.
  for (const id of userThemeIds) themeTypes.delete(id)
  userThemeIds.clear()
  for (const t of themes) {
    userThemeIds.add(t.id)
    themeTypes.set(t.id, t.type)
  }

  const blob = themes
    .map((t) => `/* user theme: ${t.id} */\n${escapeStyleCss(t.css)}`)
    .join('\n\n')

  let styleEl = document.head.querySelector<HTMLStyleElement>(
    `style[${USER_THEME_STYLE_ATTR}]`,
  )
  if (styleEl === null) {
    styleEl = document.createElement('style')
    styleEl.setAttribute(USER_THEME_STYLE_ATTR, '')
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = blob
}

/**
 * The merged theme list (built-in + currently injected user themes) as
 * ThemeDef entries, for menus/pickers. User themes appear after built-ins.
 */
export function getAllThemes(userThemes: UserTheme[]): ThemeDef[] {
  return [...THEMES, ...userThemes.map((t) => ({ id: t.id, label: t.label }))]
}

/** localStorage key holding the last applied (resolved) theme id. */
const THEME_CACHE_KEY = 'lekha:theme'


/**
 * Apply the cached theme synchronously, BEFORE React renders, to avoid the
 * first-paint flash (FOUC) where a dark-theme user briefly sees the light
 * default. Called from main.tsx prior to createRoot().render().
 *
 * Only built-in theme CSS is bundled and available this early, so a cached
 * user-theme id (whose CSS is injected later, async) falls back to the default
 * tokens until the real applyTheme runs - no worse than today. Best-effort:
 * any storage error is swallowed and the normal async restore still applies the
 * theme a moment later.
 */
export function applyCachedThemeEarly(): void {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY)
    const migrated = cached ? migrateThemeId(cached) : null
    if (migrated && THEME_IDS.has(migrated)) {
      document.documentElement.dataset['theme'] = migrated
    }
  } catch {
    // Storage unavailable - skip; useStartup's applyTheme will set it shortly.
  }
}

/**
 * Apply a theme by updating document.documentElement.dataset.theme.
 *
 * Unknown ids fall back silently to 'github' so a stale settings value
 * never leaves the UI in an undefined state.
 */
export function applyTheme(id: string): void {
  const migrated = migrateThemeId(id)
  const resolved = THEME_IDS.has(migrated) || userThemeIds.has(migrated) ? migrated : 'github'
  // Set the data-theme attribute on <html>. All CSS files loaded in main.tsx
  // use this attribute to select the correct token overrides. Setting it on
  // documentElement (not document.body) ensures :root selectors also match.
  document.documentElement.dataset['theme'] = resolved

  // Cache the resolved theme so the NEXT launch can apply it synchronously
  // before first paint (see applyCachedThemeEarly), avoiding the white -> dark
  // flash (FOUC) while the async settings load completes. localStorage is
  // best-effort: a failure here must never break theming.
  try {
    localStorage.setItem(THEME_CACHE_KEY, resolved)
  } catch {
    // Private mode / quota / disabled storage - ignore; theming still works.
  }

  // Notify theme-aware, non-CSS consumers that the app theme changed. Mermaid
  // listens for this to re-initialize with a matching theme ('night' -> 'dark')
  // and re-render existing diagrams. Using a DOM CustomEvent (rather than a
  // direct import) keeps themes/index.ts free of an eager mermaid dependency.
  document.dispatchEvent(
    new CustomEvent('lekha-theme-change', { detail: { theme: resolved } }),
  )
}

/**
 * Apply the editor content font size by setting the --editor-font-size CSS
 * variable on <html>. github.css declares
 *   .editor-pane .ProseMirror { font-size: var(--editor-font-size, 16px) }
 * so updating this variable re-sizes the editor text live, with 16px as the
 * fallback when the variable is unset (e.g. before startup restore runs).
 */
export function applyFontSize(px: number): void {
  document.documentElement.style.setProperty('--editor-font-size', `${px}px`)
}
