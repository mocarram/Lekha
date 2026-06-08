/**
 * math-plugin.ts
 *
 * A markdown-it plugin that adds inline ($...$) and block ($$...$$) math rules.
 *
 * Design:
 *   - Inline rule: tokenizes $...$ spans. Emits a single `math_inline` token
 *     with token.content = trimmed LaTeX. Guards against:
 *       - Escaped \$
 *       - Double $$ (must not be consumed here; the block rule handles $$)
 *       - Empty content
 *       - Opening $ directly preceded by a digit (avoids matching "$5 and $10")
 *       - Closing $ directly followed by a digit (same rationale)
 *   - Block rule: tokenizes $$ fences. A line starting with $$ (optionally
 *     followed by content on the opening line, though we keep it simple and
 *     only support the fence form: $$ / content / $$). Emits a `math_block`
 *     token with token.content = the inner text (trailing newline stripped).
 *
 * These patterns match the common markdown-it-texmath dollar rules.
 */

import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'
import type StateBlock from 'markdown-it/lib/rules_block/state_block.mjs'

// ---------------------------------------------------------------------------
// Inline rule: $...$
// ---------------------------------------------------------------------------

/**
 * markdown-it inline rule for $...$ math.
 *
 * Called by the inline parser at each character. Returns false to decline
 * (let other rules proceed). Returns true when a complete $...$ span was
 * consumed and a `math_inline` token was pushed.
 *
 * Edge cases handled:
 *   1. Escaped: the character before the $ is `\` - skip.
 *   2. Double $$: a second $ immediately follows - skip (block rule territory).
 *   3. Empty: closing $ comes immediately after opening $ - skip.
 *   4. Digit-adjacent (common convention): opening $ is immediately preceded
 *      by a digit, OR the character immediately after the closing $ is a digit
 *      - skip. This prevents "$5 goes to $10" from matching.
 *   5. Must find a closing $ on the same or a later position.
 */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const src = state.src
  const pos = state.pos
  const max = state.posMax

  // Must start with $
  if (src.charCodeAt(pos) !== 0x24 /* $ */) return false

  // 1. Escaped: character before is backslash
  if (pos > 0 && src.charCodeAt(pos - 1) === 0x5c /* \ */) return false

  // 2. Double $$: next char is also $ - leave for block rule
  if (src.charCodeAt(pos + 1) === 0x24 /* $ */) return false

  // 4a. Digit immediately before the opening $
  if (pos > 0) {
    const prevCode = src.charCodeAt(pos - 1)
    if (prevCode >= 0x30 && prevCode <= 0x39 /* 0-9 */) return false
  }

  // Search for closing $
  const start = pos + 1
  let end = start

  while (end <= max) {
    const code = src.charCodeAt(end)

    if (code === 0x24 /* $ */) {
      // 3. Empty: no content between $...$
      if (end === start) return false

      // 4b. Digit immediately after closing $
      if (end + 1 <= max) {
        const nextCode = src.charCodeAt(end + 1)
        if (nextCode >= 0x30 && nextCode <= 0x39 /* 0-9 */) return false
      }

      // Found a valid closing $
      const content = src.slice(start, end).trim()

      // Empty after trim - skip
      if (!content) return false

      if (!silent) {
        const token = state.push('math_inline', 'math', 0)
        token.markup = '$'
        token.content = content
      }

      state.pos = end + 1
      return true
    }

    end++
  }

  // No closing $ found
  return false
}

// ---------------------------------------------------------------------------
// Block rule: $$...$$
// ---------------------------------------------------------------------------

/**
 * markdown-it block rule for $$...$$ fences.
 *
 * Matches a line starting with $$ (possibly with trailing spaces on the fence
 * line) through a closing line that is exactly $$. Collects the inner lines
 * as the LaTeX content.
 *
 * Also supports inline block math where content follows the opening $$:
 *   $$ \int_0^1 x\,dx $$
 * However the canonical serialized form uses the fence style ($$ / content /
 * $$), so inline-block is accepted on input but serialized as fence.
 */
function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const pos = state.bMarks[startLine]! + state.tShift[startLine]!
  const max = state.eMarks[startLine]!
  const line = state.src.slice(pos, max)

  // Must start with $$
  if (!line.startsWith('$$')) return false

  // Check for single-line inline block form: $$ ... $$ (all on one line)
  // e.g. "$$ x^2 $$" - we do NOT support this form to keep serialization stable.
  // Only the fence form (opening $$, content, closing $$) is parsed.

  // Opening fence line: may be exactly $$ or $$ followed by whitespace
  const afterFence = line.slice(2).trim()

  // If there's content on the opening line AND a closing $$ on the same line,
  // that's a single-line block: "$$ content $$"
  if (afterFence.endsWith('$$') && afterFence.length > 2) {
    // Single-line block form
    const content = afterFence.slice(0, -2).trim()
    if (silent) return true

    const token = state.push('math_block', 'math', 0)
    token.block = true
    token.markup = '$$'
    token.content = content
    token.map = [startLine, startLine + 1]
    state.line = startLine + 1
    return true
  }

  // Content on the opening $$ line is NOT supported in canonical form;
  // require the fence form (opening $$ alone, then content, then $$).
  // However, allow it as a fallback: collect until closing $$
  let nextLine = startLine + 1
  const lines: string[] = []

  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!
    const lineEnd = state.eMarks[nextLine]!
    const lineContent = state.src.slice(lineStart, lineEnd)

    if (lineContent.trim() === '$$') {
      // Found closing fence
      if (silent) return true

      const token = state.push('math_block', 'math', 0)
      token.block = true
      token.markup = '$$'
      token.content = lines.join('\n')
      token.map = [startLine, nextLine + 1]
      state.line = nextLine + 1
      return true
    }

    lines.push(lineContent)
    nextLine++
  }

  // No closing $$ found; do not consume
  return false
}

// ---------------------------------------------------------------------------
// Plugin export
// ---------------------------------------------------------------------------

/**
 * markdown-it plugin that registers the inline ($...$) and block ($$...$$)
 * math rules. The inline rule runs before the default backtick rule to ensure
 * $ is intercepted first. The block rule runs before the fence rule.
 */
export function mathPlugin(md: MarkdownIt): void {
  // Inline rule: add before 'backticks' so we intercept $ early
  md.inline.ruler.before('backticks', 'math_inline', mathInlineRule)

  // Block rule: add before 'fence' so $$ fences take priority
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
}
