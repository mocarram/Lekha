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
 * Code-fence handling:
 *   Lines that appear inside a fenced code block (delimited by ``` or ~~~,
 *   each with 3 or more repeated characters) are never treated as slide
 *   separators, even if they look like `---`, `***`, or `___`.
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
 */
const SEPARATOR_RE = /^(?:---|[*]{3}|_{3})[ \t]*$/

/**
 * Regex that matches the opening (or closing) line of a fenced code block.
 * A fence is 3 or more backticks (`) or tildes (~) at the start of the line,
 * optionally followed by an info string (language tag, etc.) on opening lines.
 * We detect any line that starts with 3+ of the same fence character - a
 * closing fence is the same character repeated 3+ times with nothing after.
 * For simplicity we match either form with this single pattern and use the
 * fence character captured in group 1 to track open/close state.
 */
const FENCE_RE = /^(`{3,}|~{3,})/

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

  // 2. Walk the body line by line, tracking fenced-code state, and collect
  //    the character-offsets of real slide separators (outside fences).
  //
  //    Fence tracking:
  //      - When we encounter a line matching FENCE_RE while NOT inside a fence,
  //        we record the fence character (` or ~) and enter "inside fence" state.
  //      - While inside a fence, any line that starts with 3+ of the SAME fence
  //        character closes the fence (exits "inside fence" state).
  //      - While inside a fence, separator lines are treated as plain code content
  //        and are NOT recorded as split points.
  const lines = body.split('\n')

  // Separator positions: indices into `lines` that are real slide separators.
  const separatorLineIndices: number[] = []

  let insideFence = false
  // The fence character that opened the current fence (`` ` `` or `~`).
  let fenceChar = ''
  // The minimum length of the fence that opened the current block (e.g. 3 for
  // ```, 4 for ````). The closing fence must use the same char and length >= open.
  let fenceLen = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''

    if (insideFence) {
      // Check whether this line closes the current fence.
      // A closing fence: same character repeated >= fenceLen times, nothing else
      // on the line (trailing whitespace is allowed per CommonMark spec).
      const closeMatch = FENCE_RE.exec(line)
      if (
        closeMatch !== null &&
        closeMatch[1] !== undefined &&
        closeMatch[1][0] === fenceChar &&
        closeMatch[1].length >= fenceLen &&
        line.trim() === closeMatch[1].trim()
      ) {
        // Closing fence found - exit fenced-code state.
        insideFence = false
        fenceChar = ''
        fenceLen = 0
      }
      // Whether closing or not, this line is inside (or closing) a fence and
      // is never a slide separator.
    } else {
      // Not inside a fence - check if this line opens a new fence.
      const openMatch = FENCE_RE.exec(line)
      if (openMatch !== null && openMatch[1] !== undefined) {
        // Opening fence: record character and length, enter fenced state.
        insideFence = true
        fenceChar = openMatch[1][0] ?? ''
        fenceLen = openMatch[1].length
      } else if (SEPARATOR_RE.test(line)) {
        // Outside any fence and matches separator pattern - this is a real split.
        separatorLineIndices.push(i)
      }
    }
  }

  // 3. Reconstruct segments from the line array using the collected separator
  //    indices. Each separator line is excluded from the output.
  const segments: string[] = []
  let segStart = 0

  for (const sepIdx of separatorLineIndices) {
    segments.push(lines.slice(segStart, sepIdx).join('\n'))
    segStart = sepIdx + 1
  }
  // Last (or only) segment
  segments.push(lines.slice(segStart).join('\n'))

  // 4. Trim each segment and drop empty ones.
  const slides = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  // 5. If nothing remained (all empty), return the original body trimmed as
  //    a single slide so the presentation is never entirely empty.
  if (slides.length === 0) {
    return [body.trim()]
  }

  return slides
}
