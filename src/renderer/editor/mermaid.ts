/**
 * mermaid.ts
 *
 * Thin wrapper around the mermaid library for safe, async diagram rendering.
 *
 * Responsibilities:
 *   - Lazy-load the mermaid library on first render (it is one of the heaviest
 *     renderer deps). The module is dynamic-imported once and cached so it stays
 *     out of the initial chunk; the code_block NodeView shows its "Rendering
 *     diagram..." placeholder until the SVG resolves.
 *   - Initialize mermaid ONCE on first load (startOnLoad:false so it does not
 *     scan the DOM; securityLevel:strict for XSS safety).
 *   - Export `renderMermaid(id, code)` that wraps mermaid.render() with
 *     try/catch, returning a discriminated union so callers never need to
 *     catch themselves.
 *   - Generate unique, stable-ish render IDs via an incrementing counter so
 *     successive renders do not collide with each other or with old SVG elements
 *     left in the DOM by mermaid's internal bookkeeping.
 */

import type mermaid from 'mermaid'

// ---------------------------------------------------------------------------
// Lazy module loader
//
// mermaid is large and only needed once a diagram is actually rendered, so we
// dynamic-import it on first use. The promise is cached so the chunk is fetched
// exactly once; on resolution we initialize mermaid with the current app theme.
// `import('mermaid')` is statically analysable by Rollup, so mermaid (and its
// diagram sub-bundles) are emitted as separate, deferred chunks.
// ---------------------------------------------------------------------------

type Mermaid = typeof mermaid

let mermaidPromise: Promise<Mermaid> | null = null

function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => {
    const instance = m.default
    // Initialize with the live theme as soon as the module arrives so the first
    // render uses the correct colours.
    initMermaid(instance, currentMermaidTheme())
    return instance
  })
  return mermaidPromise
}

// ---------------------------------------------------------------------------
// Theme sync
//
// Mermaid's built-in themes are independent of the app theme, so we map the
// app's data-theme attribute to a mermaid theme: the dark app theme ('night')
// uses mermaid's 'dark' theme; every other app theme uses 'default'. The
// mapping is a pure function so it is unit-testable.
//
// LIVE re-render: applyTheme (themes/index.ts) dispatches a 'lekha-theme-change'
// event after switching. We listen for it here, re-initialize mermaid with the
// new theme, and broadcast 'lekha-mermaid-rerender' so every code_block NodeView
// re-renders its diagram with the new colours. NEW diagrams always use the
// current theme because runRender reads the live mermaid config.
// ---------------------------------------------------------------------------

/** Mermaid theme name. Kept narrow - we only use these two. */
export type MermaidTheme = 'default' | 'dark'

/** App theme ids that render on a dark background and want mermaid's dark theme. */
const DARK_THEMES = new Set(['night', 'graphite', 'nord', 'solarized-dark'])

/**
 * Map an app `data-theme` attribute value to the matching mermaid theme.
 * Dark app themes -> 'dark'; anything else -> 'default'.
 *
 * Pure: takes the raw attribute (which may be undefined when unset) and returns
 * the mermaid theme name. Unit-tested in mermaid theme tests.
 */
export function mermaidThemeFor(dataTheme: string | undefined): MermaidTheme {
  return dataTheme !== undefined && DARK_THEMES.has(dataTheme) ? 'dark' : 'default'
}

/** Read the live app theme from the document, defaulting to mermaid 'default'. */
function currentMermaidTheme(): MermaidTheme {
  // In non-DOM environments (should not happen in the renderer) fall back safely.
  const dataTheme =
    typeof document !== 'undefined'
      ? document.documentElement.dataset['theme']
      : undefined
  return mermaidThemeFor(dataTheme)
}

/**
 * (Re)initialize mermaid with the given theme. Called on first load with the
 * live theme, and again on every app theme change via setMermaidTheme.
 */
function initMermaid(instance: Mermaid, theme: MermaidTheme): void {
  instance.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
  })
}

// Custom DOM events used to sync mermaid with the app theme.
const THEME_CHANGE_EVENT = 'lekha-theme-change'
export const MERMAID_RERENDER_EVENT = 'lekha-mermaid-rerender'

/**
 * Re-initialize mermaid for the given app `data-theme` and ask every live
 * diagram NodeView to re-render. Called by the theme-change listener below.
 *
 * If mermaid has not been loaded yet (no diagram rendered so far) there is
 * nothing to re-initialize and no diagram on screen, so we skip the work; the
 * next render will pick up the current theme via loadMermaid().
 */
function setMermaidTheme(dataTheme: string | undefined): void {
  if (mermaidPromise !== null) {
    void mermaidPromise.then((instance) =>
      initMermaid(instance, mermaidThemeFor(dataTheme)),
    )
    if (typeof document !== 'undefined') {
      document.dispatchEvent(new CustomEvent(MERMAID_RERENDER_EVENT))
    }
  }
}

// ---------------------------------------------------------------------------
// Theme-change wiring
//
// Re-init + re-render whenever applyTheme dispatches the theme-change event.
// Registered once at module load; the renderer process keeps this module alive
// for the app lifetime so no teardown is needed. The mermaid library itself is
// not loaded until the first diagram render (setMermaidTheme no-ops until then).
// ---------------------------------------------------------------------------

if (typeof document !== 'undefined') {
  document.addEventListener(THEME_CHANGE_EVENT, (e) => {
    const detail = (e as CustomEvent<{ theme?: string }>).detail
    setMermaidTheme(detail?.theme)
  })
}

// ---------------------------------------------------------------------------
// Unique ID counter
// ---------------------------------------------------------------------------

/**
 * Ever-increasing counter used to build unique mermaid render IDs.
 * Counter-based (not Math.random / Date) so IDs are deterministic and
 * monotonically increasing - no two concurrent renders share an ID.
 */
let renderCounter = 0

function nextRenderId(hint: string): string {
  renderCounter += 1
  // Include the hint (caller-supplied prefix) for debuggability; strip chars
  // that are invalid in SVG element ids (anything that is not word char / dash).
  const safeHint = hint.replace(/[^\w-]/g, '').slice(0, 32)
  return `lekha-diagram-${safeHint ? safeHint + '-' : ''}${renderCounter}`
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type RenderSuccess = { svg: string }
export type RenderError = { error: string }
export type RenderResult = RenderSuccess | RenderError

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render `code` as a mermaid diagram and return the resulting SVG string.
 *
 * @param id   - Caller-supplied hint used to build a unique render ID.
 *               Pass an empty string when no meaningful hint is available.
 * @param code - Mermaid diagram source text.
 * @returns    `{ svg }` on success, `{ error }` on invalid syntax or render failure.
 *
 * Mermaid throws synchronously (or rejects) on invalid syntax - this wrapper
 * always catches those and returns `{ error }` so callers need no try/catch.
 */
export async function renderMermaid(
  id: string,
  code: string,
): Promise<RenderResult> {
  const renderId = nextRenderId(id)
  try {
    // Lazy-load mermaid on first render (cached thereafter). Until this resolves
    // the NodeView shows its "Rendering diagram..." placeholder.
    const instance = await loadMermaid()
    // mermaid.render() returns { svg, diagramType, bindFunctions? }
    // We only need the svg string for display.
    const result = await instance.render(renderId, code)
    return { svg: result.svg }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
