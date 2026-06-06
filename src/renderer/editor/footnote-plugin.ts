/**
 * footnote-plugin.ts
 *
 * Custom markdown-it plugin for GFM-style footnotes with LOSSLESS round-trip.
 *
 * WHY NOT use markdown-it-footnote directly:
 *   The upstream plugin moves all footnote definitions to the end of the
 *   token stream (inside a `footnote_block_open/close` wrapper) and assigns
 *   sequential numeric IDs regardless of the original label. This makes it
 *   impossible to reconstruct `[^id]: content` at the original document
 *   position from the emitted tokens alone - the label-to-number mapping
 *   lives in `env.footnotes` and positional ordering is lost.
 *
 *   Our rules emit tokens that preserve:
 *     - The original label string (e.g. `1`, `note`, `abc`)
 *     - The definition at its original document position
 *
 * Token shapes:
 *   Inline reference:  `footnote_ref`   (nesting=0, meta.label = label)
 *   Definition open:   `footnote_def_open`  (nesting=1, meta.label = label)
 *   Definition content: normal block tokens (paragraph, inline, etc.)
 *   Definition close:  `footnote_def_close` (nesting=-1)
 *
 * The ProseMirror token spec in parser.ts maps:
 *   `footnote_ref`       -> `footnote_ref` inline node  (attr: label)
 *   `footnote_def`       -> `footnote_definition` block (attr: label)
 */

import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'

// ---------------------------------------------------------------------------
// Block rule: [^label]: content
// ---------------------------------------------------------------------------

/**
 * Block rule for `[^label]: content`.
 *
 * Matches lines of the form:
 *   [^label]: First line content
 *   (optionally) continued on indented lines
 *
 * We emit `footnote_def_open` / content tokens / `footnote_def_close`.
 * The content is parsed as a single paragraph inline.
 *
 * Multi-paragraph footnotes are out of scope for MVP; only the first
 * paragraph (content on the `[^label]:` line) is captured.
 */
function footnoteDefRule(
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine]! + state.tShift[startLine]!
  const max = state.eMarks[startLine]!
  const src = state.src

  // Must start with [^
  if (startPos + 2 >= max) return false
  if (src.charCodeAt(startPos) !== 0x5b /* [ */) return false
  if (src.charCodeAt(startPos + 1) !== 0x5e /* ^ */) return false

  // Find closing ]
  let pos = startPos + 2
  while (pos < max) {
    const ch = src.charCodeAt(pos)
    if (ch === 0x5d /* ] */) break
    if (ch === 0x0a /* \n */ || ch === 0x5b /* [ */) return false
    pos++
  }
  if (pos >= max) return false
  if (src.charCodeAt(pos) !== 0x5d /* ] */) return false

  // Must be followed by :
  if (pos + 1 >= max) return false
  if (src.charCodeAt(pos + 1) !== 0x3a /* : */) return false

  const label = src.slice(startPos + 2, pos)
  if (!label) return false

  if (silent) return true

  // Content starts after `[^label]: `
  const contentStart = pos + 2
  // Skip optional space after colon
  const contentPos = src.charCodeAt(contentStart) === 0x20 ? contentStart + 1 : contentStart
  const content = src.slice(contentPos, max)

  const openToken = state.push('footnote_def_open', '', 1)
  openToken.meta = { label }
  openToken.block = true
  openToken.map = [startLine, startLine + 1]

  // Emit a paragraph containing the definition content
  const paragraphOpen = state.push('paragraph_open', 'p', 1)
  paragraphOpen.block = true

  const inlineToken = state.push('inline', '', 0)
  inlineToken.content = content
  inlineToken.children = []

  const paragraphClose = state.push('paragraph_close', 'p', -1)
  paragraphClose.block = true

  const closeToken = state.push('footnote_def_close', '', -1)
  closeToken.block = true

  state.line = startLine + 1
  return true
}

// ---------------------------------------------------------------------------
// Inline rule: [^label]
// ---------------------------------------------------------------------------

/**
 * Inline rule for `[^label]` footnote references.
 *
 * Emits a `footnote_ref` token (nesting=0) with `meta.label` set to the
 * raw label string. This token maps to a `footnote_ref` ProseMirror inline
 * atom node.
 */
function footnoteRefRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const pos = state.pos
  const max = state.posMax

  // Must start with [^
  if (pos + 2 > max) return false
  if (src.charCodeAt(pos) !== 0x5b /* [ */) return false
  if (src.charCodeAt(pos + 1) !== 0x5e /* ^ */) return false

  // Find closing ]
  let end = pos + 2
  while (end <= max) {
    const ch = src.charCodeAt(end)
    if (ch === 0x5d /* ] */) break
    if (ch === 0x0a /* \n */ || ch === 0x5b /* [ */) return false
    end++
  }
  if (end > max) return false
  if (src.charCodeAt(end) !== 0x5d /* ] */) return false

  const label = src.slice(pos + 2, end)
  if (!label) return false

  if (!silent) {
    const token = state.push('footnote_ref', '', 0)
    token.meta = { label }
  }

  state.pos = end + 1
  return true
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

/**
 * markdown-it plugin registering:
 *   - Block rule `footnote_def` for `[^label]: content`
 *   - Inline rule `footnote_ref` for `[^label]`
 *
 * Registered before `paragraph`/`image` so they intercept the syntax first.
 */
export function footnotePlugin(md: MarkdownIt): void {
  // Block rule: before `reference` so `[^id]: content` isn't consumed by
  // CommonMark's reference-link definition rule (which would treat it as a
  // link definition for a `[^id]` reference, not a footnote).
  md.block.ruler.before('reference', 'footnote_def', footnoteDefRule, {
    alt: ['paragraph', 'reference'],
  })

  // Inline rule: before `link` so `[^id]` is intercepted before CommonMark's
  // link rule treats it as a reference-style link (e.g. `[^1]` -> link to
  // anchor defined by `[^1]: ...` block rule above).
  md.inline.ruler.before('link', 'footnote_ref', footnoteRefRule)
}
