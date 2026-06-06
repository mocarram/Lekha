/**
 * toc-plugin.ts
 *
 * markdown-it block rule that recognizes a line containing only `[toc]`
 * (case-insensitive, optional surrounding whitespace) and emits a `toc` token.
 *
 * The token maps to a ProseMirror `toc` atom node whose NodeView renders a
 * live table of contents derived from the document's headings.
 *
 * Serializes back to `[toc]` (canonical lowercase).
 */

import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'

const TOC_RE = /^\[toc\]\s*$/i

/**
 * Block rule that matches a paragraph-like block whose sole content is `[toc]`.
 * We need to run it before `paragraph` so the text doesn't get absorbed into a
 * plain paragraph node.
 */
function tocRule(
  state: StateBlock,
  startLine: number,
  _endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine]! + state.tShift[startLine]!
  const startMax = state.eMarks[startLine]!
  const lineText = state.src.slice(startPos, startMax)

  if (!TOC_RE.test(lineText)) return false

  if (silent) return true

  const token = state.push('toc', '', 0)
  token.block = true
  token.content = '[toc]'
  token.map = [startLine, startLine + 1]

  state.line = startLine + 1
  return true
}

/**
 * markdown-it plugin registering the [toc] block rule.
 * Runs before `paragraph` to intercept standalone `[toc]` lines.
 */
export function tocPlugin(md: MarkdownIt): void {
  md.block.ruler.before('paragraph', 'toc', tocRule, {
    alt: ['paragraph', 'reference', 'blockquote'],
  })
}
