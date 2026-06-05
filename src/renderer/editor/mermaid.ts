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
// One-time initialization
// ---------------------------------------------------------------------------

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'strict',
  theme: 'default',
})

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
