/*
 * Shared plain-text matcher used by BOTH folder search and folder replace, so
 * highlighting and replacement always agree. No regex is exposed.
 */

export interface TextSearchOptions {
  caseSensitive: boolean
  wholeWord: boolean
}

const WORD_CHAR = /[A-Za-z0-9_]/

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHAR.test(ch)
}

/**
 * Every [start, end) offset of `query` in `text` under `opts`, left to right,
 * non-overlapping. Empty `query` returns []. `wholeWord` requires a non-word
 * char (or string edge) on both sides of a match. ASCII word chars only.
 */
export function findMatchRanges(
  text: string,
  query: string,
  opts: TextSearchOptions,
): Array<[number, number]> {
  if (query.length === 0) return []
  const haystack = opts.caseSensitive ? text : text.toLowerCase()
  const needle = opts.caseSensitive ? query : query.toLowerCase()
  const ranges: Array<[number, number]> = []
  let from = 0
  for (;;) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    const end = idx + needle.length
    if (!opts.wholeWord || (!isWordChar(text[idx - 1]) && !isWordChar(text[end]))) {
      ranges.push([idx, end])
    }
    from = end
  }
  return ranges
}

/** Replace every match of `query` with `replacement`; returns new text + count. */
export function replaceAllInText(
  text: string,
  query: string,
  replacement: string,
  opts: TextSearchOptions,
): { text: string; count: number } {
  const ranges = findMatchRanges(text, query, opts)
  if (ranges.length === 0) return { text, count: 0 }
  let out = ''
  let last = 0
  for (const [start, end] of ranges) {
    out += text.slice(last, start) + replacement
    last = end
  }
  out += text.slice(last)
  return { text: out, count: ranges.length }
}
