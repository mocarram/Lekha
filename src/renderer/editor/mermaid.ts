/**
 * mermaid.ts
 *
 * Thin wrapper around the mermaid library for safe, async diagram rendering.
 *
 * Responsibilities:
 *   - Initialize mermaid ONCE at module load (startOnLoad:false so it does not
 *     scan the DOM; securityLevel:strict for XSS safety).
 *   - Export `renderMermaid(id, code)` that wraps mermaid.render() with
 *     try/catch, returning a discriminated union so callers never need to
 *     catch themselves.
 *   - Generate unique, stable-ish render IDs via an incrementing counter so
 *     successive renders do not collide with each other or with old SVG elements
 *     left in the DOM by mermaid's internal bookkeeping.
 */

import mermaid from 'mermaid'

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

/**
 * Map an app `data-theme` attribute value to the matching mermaid theme.
 * 'night' (the dark app theme) -> 'dark'; anything else -> 'default'.
 *
 * Pure: takes the raw attribute (which may be undefined when unset) and returns
 * the mermaid theme name. Unit-tested in mermaid theme tests.
 */
export function mermaidThemeFor(dataTheme: string | undefined): MermaidTheme {
  return dataTheme === 'night' ? 'dark' : 'default'
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
 * (Re)initialize mermaid with the given theme. Called once at module load with
 * the live theme, and again on every app theme change via setMermaidTheme.
 */
function initMermaid(theme: MermaidTheme): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme,
  })
}

// Custom DOM events used to sync mermaid with the app theme.
export const THEME_CHANGE_EVENT = 'lekha-theme-change'
export const MERMAID_RERENDER_EVENT = 'lekha-mermaid-rerender'

/**
 * Re-initialize mermaid for the given app `data-theme` and ask every live
 * diagram NodeView to re-render. Called by the theme-change listener below.
 */
export function setMermaidTheme(dataTheme: string | undefined): void {
  initMermaid(mermaidThemeFor(dataTheme))
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(MERMAID_RERENDER_EVENT))
  }
}

// ---------------------------------------------------------------------------
// One-time initialization (uses the live app theme)
// ---------------------------------------------------------------------------

initMermaid(currentMermaidTheme())

// Re-init + re-render whenever applyTheme dispatches the theme-change event.
// Registered once at module load; the renderer process keeps this module alive
// for the app lifetime so no teardown is needed.
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
    // mermaid.render() returns { svg, diagramType, bindFunctions? }
    // We only need the svg string for display.
    const result = await mermaid.render(renderId, code)
    return { svg: result.svg }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { error: message }
  }
}
