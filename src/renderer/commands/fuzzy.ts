/**
 * fuzzy.ts - a small, dependency-free fuzzy matcher used by the command
 * palette and quick-open.
 *
 * `fuzzyMatch` does a case-insensitive subsequence match: every query
 * character must appear in the text in order. The returned score rewards
 * matches that are contiguous and that land at the start of a word (or the
 * start of the string), so the most "obvious" hit floats to the top.
 *
 * `fuzzyFilter` maps the matcher over a list, drops non-matches, and sorts by
 * descending score (ties broken by original order via a stable sort). An empty
 * query short-circuits to "all items, original order" so the palette shows the
 * full set before the user types.
 */

export interface FuzzyResult {
  /** Whether every query character was found in order. */
  matched: boolean
  /** Higher is a better match. Meaningless when `matched` is false. */
  score: number
  /** Indices into `text` of the matched characters (for highlighting). */
  indices: number[]
}

export interface FuzzyMatch<T> {
  item: T
  score: number
  indices: number[]
}

// Scoring weights. Kept here so the ranking is easy to tune in one place.
const SCORE_MATCH = 1 // base reward for matching a character
const SCORE_CONTIGUOUS = 8 // bonus when this char immediately follows the previous match
const SCORE_START_OF_WORD = 6 // bonus when this char begins a word (after a separator)
const SCORE_LEADING = 10 // extra bonus when the very first match is at index 0

/** Characters that delimit "words" for the start-of-word bonus. */
const WORD_SEPARATORS = new Set([' ', '-', '_', '/', '.', '\\'])

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true
  return WORD_SEPARATORS.has(text[index - 1] ?? '')
}

/**
 * Case-insensitive subsequence match of `query` against `text`.
 *
 * Greedy left-to-right: each query character claims the next occurrence in the
 * text. This is fast and good enough for short command labels and filenames.
 */
export function fuzzyMatch(query: string, text: string): FuzzyResult {
  if (query.length === 0) {
    return { matched: true, score: 0, indices: [] }
  }

  const q = query.toLowerCase()
  const t = text.toLowerCase()

  const indices: number[] = []
  let score = 0
  let qi = 0
  let prevMatch = -2 // so the first match is never treated as contiguous

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue

    let charScore = SCORE_MATCH
    if (ti === prevMatch + 1) charScore += SCORE_CONTIGUOUS
    if (isWordStart(text, ti)) charScore += SCORE_START_OF_WORD
    if (indices.length === 0 && ti === 0) charScore += SCORE_LEADING

    score += charScore
    indices.push(ti)
    prevMatch = ti
    qi++
  }

  if (qi < q.length) {
    return { matched: false, score: 0, indices: [] }
  }
  return { matched: true, score, indices }
}

/**
 * Filter and rank `items` by how well `keyFn(item)` fuzzy-matches `query`.
 *
 * Empty query -> all items in original order. Otherwise -> only matches,
 * sorted best-first. The sort is stable (Array.prototype.sort is stable in
 * modern engines), so equal scores keep their original relative order.
 */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  keyFn: (item: T) => string,
): FuzzyMatch<T>[] {
  if (query.trim().length === 0) {
    return items.map((item) => ({ item, score: 0, indices: [] }))
  }

  const matches: FuzzyMatch<T>[] = []
  for (const item of items) {
    const result = fuzzyMatch(query, keyFn(item))
    if (result.matched) {
      matches.push({ item, score: result.score, indices: result.indices })
    }
  }

  matches.sort((a, b) => b.score - a.score)
  return matches
}
