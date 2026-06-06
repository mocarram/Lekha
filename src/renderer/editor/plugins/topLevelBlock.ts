/**
 * topLevelBlock.ts - shared helper for "active block" detection.
 *
 * Both focusMode and activeBlock decorate the top-level block (direct child of
 * the doc) that contains the selection head. This helper centralizes the walk
 * so the two plugins stay in lockstep (DRY).
 */

import type { EditorState } from 'prosemirror-state'

/** Half-open range `[from, to)` of a top-level block, or null if none found. */
export interface BlockRange {
  from: number
  to: number
}

/**
 * Return the position range of the top-level block (direct doc child) that
 * contains `state.selection.head`.
 *
 * If the head sits exactly at pos 0 (before any content), the first block is
 * returned. Returns null only for an empty document.
 */
export function findActiveTopLevelBlock(state: EditorState): BlockRange | null {
  const { doc, selection } = state
  const { head } = selection

  let offset = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    const start = offset
    const end = offset + child.nodeSize
    // Head is inside this block if start < head <= end. (Content inside a block
    // at offset `start` begins at start + 1; the block spans [start, end).)
    if (head > start && head <= end) {
      return { from: start, to: end }
    }
    offset = end
  }

  // Fallback: cursor at pos 0 (before doc content) -> first block.
  if (doc.childCount > 0) {
    return { from: 0, to: doc.child(0).nodeSize }
  }

  return null
}
