/**
 * slides.ts
 *
 * Pure utility for splitting a Markdown document into an array of slide
 * strings suitable for presentation mode.
 *
 * Slide separator convention (standard Markdown slides / reveal.js style):
 *   A line that is exactly `---`, `***`, or `___` (optionally surrounded by
 *   blank lines) is treated as a slide break.
 *
 * Front-matter handling:
 *   A YAML front-matter block is a `---` ... `---` section that starts at the
 *   VERY FIRST LINE of the document. Its delimiters MUST NOT be treated as
 *   slide separators. The front-matter content is stripped from the output
 *   entirely (it is metadata, not slide content).
 *
 * Empty-slide handling:
 *   After splitting, any segment that trims to an empty string is dropped.
 *   This handles consecutive separators (e.g. `---\n---`) and leading/trailing
 *   separators.
 *
 * If there are no separators (or all segments are empty after stripping), the
 * entire document is returned as a single-element array containing the full
 * text (minus any front-matter).
 */

// ---------------------------------------------------------------------------
// YAML front-matter extraction
// ---------------------------------------------------------------------------

/**
 * If the document starts with a YAML front-matter block (`---\n...\n---`),
 * strip it and return the remaining body. Otherwise return the original string.
 *
 * Rules:
 *   - The opening `---` must be the very first line (offset 0).
 *   - The closing `---` is the next occurrence of a `---`-only line.
 *   - The function is lenient about trailing whitespace on the delimiter lines.
 */
function stripFrontMatter(markdown: string): string {
  // Front-matter must begin at position 0.
  if (!markdown.startsWith('---')) return markdown

  // The character immediately after `---` must be a newline (or end of string),
  // not more dashes. This avoids treating `----` as a front-matter start.
  const afterOpen = markdown.slice(3)
  if (afterOpen.length > 0 && afterOpen[0] !== '\n' && afterOpen[0] !== '\r') {
    return markdown
  }

  // Find the closing `---` line.
  // We search from the character after the opening `---\n`.
  const bodyStart = markdown.indexOf('\n', 0) + 1
  if (bodyStart === 0) return markdown // no newline - malformed

  // Walk line by line looking for the closing ---
  const lines = markdown.split('\n')
  // lines[0] is the opening `---`. We look for the next `---` at index >= 1.
  for (let i = 1; i < lines.length; i++) {
    if ((lines[i] ?? '').trim() === '---') {
      // lines[0..i] is the front-matter block. Everything after line i is the body.
      const bodyLines = lines.slice(i + 1)
      return bodyLines.join('\n').replace(/^\n+/, '') // strip leading blank lines
    }
  }

  // No closing --- found - treat the whole document as content (no front-matter).
  return markdown
}

// ---------------------------------------------------------------------------
// Separator detection
// ---------------------------------------------------------------------------

/**
 * Regex that matches a slide-separator line: a line containing ONLY `---`,
 * `***`, or `___` (any of these exactly three characters, optionally with
 * trailing spaces/tabs before the newline).
 *
 * We split on this pattern across the whole body (after front-matter removal).
 * The `m` flag makes `^`/`$` match line boundaries.
 */
const SEPARATOR_RE = /^(?:---|[*]{3}|_{3})[ \t]*$/m

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split `markdown` into an array of slide strings.
 *
 * @param markdown - Raw Markdown source (may contain YAML front-matter).
 * @returns        Non-empty array of slide strings. Each element is trimmed.
 *                 If there are no separators the array has exactly one element.
 *                 Empty segments (from consecutive separators) are dropped.
 *                 The returned array always has at least one element.
 */
export function splitSlides(markdown: string): string[] {
  // 1. Strip YAML front-matter so its --- delimiters are never treated as slides.
  const body = stripFrontMatter(markdown)

  // 2. Split on slide separators (---, ***, ___).
  //    We split on lines matching SEPARATOR_RE. We use a global regex exec loop
  //    rather than String.split() so that surrounding blank lines are consumed
  //    as part of the separator, giving clean slide content without leading/
  //    trailing blank lines on each segment.
  const segments: string[] = []
  const remaining = body

  const sepGlobal = new RegExp(SEPARATOR_RE.source, 'gm')
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = sepGlobal.exec(remaining)) !== null) {
    // Segment before this separator
    segments.push(remaining.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
  }

  // Last (or only) segment after the final separator
  segments.push(remaining.slice(lastIndex))

  // 3. Trim each segment and drop empty ones.
  const slides = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // 4. If nothing remained (all empty), return the original body trimmed as
  //    a single slide so the presentation is never entirely empty.
  if (slides.length === 0) {
    return [body.trim()]
  }

  return slides
}
