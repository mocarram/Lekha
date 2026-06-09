/**
 * Pure search/replace helpers for ProseMirror documents.
 *
 * Position arithmetic
 * -------------------
 * A ProseMirror document is a tree of nodes. Every node has an "open" token
 * at the position just before its content and a "close" token just after.
 *
 * For text-block nodes (paragraph, heading, etc.) the layout is:
 *
 *   pos=blockStart        <- the block's opening token
 *   pos=blockStart+1      <- first character of the text content
 *   pos=blockStart+1+n    <- character at offset n
 *   pos=blockStart+1+len  <- the block's closing token
 *
 * ProseMirror's `Node.descendants(cb)` calls `cb(node, pos)` where `pos` is
 * the position of the node's opening token. So text character 0 inside a
 * textblock lives at `pos + 1`, character k at `pos + 1 + k`.
 *
 * `doc.textBetween(from, to)` extracts the text content between those
 * positions (exclusive end), which lets us verify matches cheaply in tests.
 */

import type { Node } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'
import { findMatchRanges } from '@shared/textSearch'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FindMatch {
  from: number
  to: number
}

export interface FindOptions {
  caseSensitive: boolean
  /**
   * When true, only matches bounded by a non-word character (or string edge)
   * on both sides count. Optional - defaults to false (plain substring) so the
   * Cmd+F find UI, which has no whole-word toggle, keeps its existing behavior.
   */
  wholeWord?: boolean
}

// ---------------------------------------------------------------------------
// findMatches
// ---------------------------------------------------------------------------

/**
 * Scan every textblock in `doc` and return non-overlapping occurrences of
 * `query` as absolute document positions.
 *
 * - Empty query always returns [].
 * - `opts.caseSensitive` controls case folding.
 * - Matches do NOT span across blocks (each textblock is scanned independently).
 */
export function findMatches(
  doc: Node,
  query: string,
  opts: FindOptions,
): FindMatch[] {
  if (!query) return []

  const matches: FindMatch[] = []
  const matchOpts = {
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord ?? false,
  }

  doc.descendants((node, pos) => {
    // Only scan leaf text blocks (paragraphs, headings, list items, etc.)
    if (!node.isTextblock) return true

    // Reuse the shared matcher so the in-document find uses EXACTLY the same
    // semantics (case + whole-word) as the folder search; otherwise highlights
    // and jump targets would disagree with the sidebar results.
    // The first character of the block's content is at pos + 1 in the document.
    const ranges = findMatchRanges(node.textContent, query, matchOpts)
    for (const [start, end] of ranges) {
      matches.push({ from: pos + 1 + start, to: pos + 1 + end })
    }

    // Don't recurse into textblock children (they're just text nodes).
    return false
  })

  return matches
}

// ---------------------------------------------------------------------------
// replaceAllTr
// ---------------------------------------------------------------------------

/**
 * Build a single transaction that replaces all occurrences of `query` with
 * `replacement` in `state.doc`.
 *
 * Replacement is done from LAST match to FIRST so earlier positions stay valid
 * as we apply each replacement. (Replacing later positions first never shifts
 * the absolute positions of earlier matches.)
 *
 * Returns the prepared transaction and the number of replacements made.
 * If there are no matches (or query is empty) the transaction is a no-op and
 * count is 0.
 */
export function replaceAllTr(
  state: EditorState,
  query: string,
  replacement: string,
  opts: FindOptions,
): { tr: Transaction; count: number } {
  const matches = findMatches(state.doc, query, opts)

  if (matches.length === 0) {
    return { tr: state.tr, count: 0 }
  }

  let tr = state.tr

  // Replace from last to first to preserve earlier positions.
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i]!
    tr = tr.insertText(replacement, match.from, match.to)
  }

  return { tr, count: matches.length }
}
