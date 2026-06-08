/**
 * frontmatter-plugin.ts
 *
 * markdown-it block rule that recognizes a leading YAML front-matter fence:
 *
 *   ---
 *   key: value
 *   ---
 *
 * ONLY valid as the very first block in the document (startLine === 0 and
 * no content has yet been consumed). A `---` fence appearing mid-document is
 * treated as a horizontal rule by the standard CommonMark rules.
 *
 * The rule emits a single `front_matter` token with:
 *   token.content = the raw YAML text between the fences (no surrounding newlines)
 *   token.block   = true
 *   token.nesting = 0
 *
 * Token mapping in parser.ts then builds a `front_matter` ProseMirror node
 * whose text content holds the raw YAML, enabling lossless serialization back
 * to `---\n<yaml>\n---`.
 */

import type MarkdownIt from 'markdown-it'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'

const FENCE_RE = /^-{3,}\s*$/

/**
 * markdown-it block rule for YAML front-matter.
 *
 * Guards: startLine === 0 (only at document start) and the current line is
 * exactly `---` (CommonMark's hr rule would normally consume it, but since
 * we register BEFORE `hr` and `lheading`, we intercept it first).
 *
 * The rule is deliberately strict: it only matches `---` (or more dashes),
 * NOT `...` closing fences (YAML spec), to stay compatible with the most
 * common Pandoc convention.
 */
function frontMatterRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  // ONLY at the very beginning of the document.
  if (startLine !== 0) return false

  const startPos = state.bMarks[startLine]! + state.tShift[startLine]!
  const startMax = state.eMarks[startLine]!
  const startLineText = state.src.slice(startPos, startMax)

  // Opening fence must be exactly `---` (optionally more dashes, no content after).
  if (!FENCE_RE.test(startLineText)) return false

  // Search for the closing `---` fence.
  let nextLine = startLine + 1
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!
    const lineEnd = state.eMarks[nextLine]!
    const lineText = state.src.slice(lineStart, lineEnd)

    if (FENCE_RE.test(lineText)) {
      // Found the closing fence.
      if (silent) return true

      // Collect YAML content lines (between the two fences).
      const contentLines: string[] = []
      for (let i = startLine + 1; i < nextLine; i++) {
        const ls = state.bMarks[i]!
        const le = state.eMarks[i]!
        contentLines.push(state.src.slice(ls, le))
      }

      const token = state.push('front_matter', '', 0)
      token.block = true
      token.content = contentLines.join('\n')
      token.markup = '---'
      token.map = [startLine, nextLine + 1]

      state.line = nextLine + 1
      return true
    }

    nextLine++
  }

  // No closing fence found: not front-matter.
  return false
}

/**
 * markdown-it plugin that registers the YAML front-matter block rule.
 * Registered BEFORE `hr` so the leading `---` is consumed by this rule first.
 */
export function frontMatterPlugin(md: MarkdownIt): void {
  md.block.ruler.before('hr', 'front_matter', frontMatterRule, {
    alt: [],
  })
}
