/**
 * topLevelBlock.ts - shared helper for "active block" detection.
 *
 * Both focusMode and activeBlock decorate the top-level block (direct child of
 * the doc) that contains the selection head. This helper centralizes the walk
 * so the two plugins stay in lockstep (DRY).
 */

import { Plugin, type PluginKey, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

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
  if (doc.childCount === 0) return null
  const { head } = selection

  // Fast path (the common case while typing): the cursor sits INSIDE a block, so
  // the head resolves to depth >= 1 and the top-level block is its depth-1
  // ancestor. before(1)/after(1) are O(tree depth) - they do NOT scan sibling
  // blocks. This matters on large documents: the old linear scan was O(number of
  // top-level blocks) and ran on EVERY keystroke for BOTH the focusMode and
  // activeBlock decoration plugins, so typing near the end of a multi-thousand-
  // block document cost O(blocks) per character.
  const $head = doc.resolve(head)
  if ($head.depth >= 1) {
    return { from: $head.before(1), to: $head.after(1) }
  }

  // Rare boundary path (head resolves at depth 0: exactly at the doc start, or on
  // the seam between two top-level blocks). Keep the original linear-scan
  // semantics EXACTLY - the block whose [start, end) satisfies start < head <=
  // end, else the first block - so boundary behaviour is byte-for-byte unchanged.
  let offset = 0
  for (let i = 0; i < doc.childCount; i++) {
    const start = offset
    const end = offset + doc.child(i).nodeSize
    if (head > start && head <= end) {
      return { from: start, to: end }
    }
    offset = end
  }
  return { from: 0, to: doc.child(0).nodeSize }
}

/** Build the (single-decoration) set for the active top-level block. */
function buildActiveBlockSet(state: EditorState, className: string): DecorationSet {
  const block = findActiveTopLevelBlock(state)
  if (!block) return DecorationSet.empty
  return DecorationSet.create(state.doc, [
    Decoration.node(block.from, block.to, { class: className }),
  ])
}

/**
 * Build a ProseMirror plugin that wraps the active top-level block (the one
 * containing the selection head) with a node decoration carrying `className`.
 * Shared by focusMode and activeBlock.
 *
 * PERFORMANCE: the decoration lives in plugin STATE and is MAPPED forward on
 * every transaction (cheap, structurally shared), and only REBUILT when the
 * active block actually changes (cursor moved to a different block, or the doc
 * structure changed such that the decoration no longer brackets the active
 * block). The naive alternative - recomputing a fresh DecorationSet in
 * `props.decorations(state)` on every update - forces ProseMirror to diff a
 * brand-new set against the previous one on each keystroke, which is O(document)
 * and made typing in large documents janky. Mapping keeps the per-keystroke cost
 * O(change) while the cursor stays in one block (the overwhelmingly common case).
 */
export function activeBlockDecorationPlugin(
  key: PluginKey<DecorationSet>,
  className: string,
): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_config, state) => buildActiveBlockSet(state, className),
      apply: (tr, oldSet, _oldState, newState) => {
        // Nothing that could move the decoration changed -> reuse as-is.
        if (!tr.docChanged && !tr.selectionSet) return oldSet
        // Map the existing decoration through the edit (keeps it bracketing the
        // same block as its content grows/shrinks; structurally shared).
        const mapped = oldSet.map(tr.mapping, tr.doc)
        const block = findActiveTopLevelBlock(newState)
        const cur = mapped.find()
        const unchanged =
          block !== null &&
          cur.length === 1 &&
          cur[0]!.from === block.from &&
          cur[0]!.to === block.to
        // Same active block (typing within it) -> reuse the mapped set (no
        // create, no full diff). Otherwise rebuild for the new active block.
        return unchanged ? mapped : buildActiveBlockSet(newState, className)
      },
    },
    props: {
      decorations(state) {
        return key.getState(state)
      },
    },
  })
}
