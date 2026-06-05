/**
 * focusMode.ts - ProseMirror plugin for Focus Mode.
 *
 * Focus mode dims all top-level blocks except the one containing the cursor.
 *
 * APPROACH:
 *   - This plugin is always active (never reconfigured on toggle).
 *   - It adds a NODE decoration with class `block-focused` to exactly the
 *     top-level block (direct child of doc) that contains the selection head.
 *   - The CSS in github.css gates the dimming: blocks are only dimmed when the
 *     editor container has the class `focus-mode`. Without that class, all
 *     blocks render at full opacity regardless of the `block-focused` deco.
 *   - This means toggling focus mode only requires adding/removing a CSS class
 *     on the container - no plugin reconfiguration, no transaction dispatch.
 *
 * DECORATION:
 *   Node decoration: wraps the top-level node so `.ProseMirror > .block-focused`
 *   can be targeted in CSS. The `class` attribute is set on the wrapper element
 *   by ProseMirror via NodeDecoration attrs.
 */

import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'

// Exported key so tests can look up the plugin by key name.
export const focusModeKey = new PluginKey<DecorationSet>('focusMode')

/**
 * Return a ProseMirror Plugin that decorates the focused top-level block.
 *
 * The plugin computes decorations on every state change: it finds the direct
 * child of the doc that contains `state.selection.head` and wraps it with a
 * node decoration carrying `class: 'block-focused'`.
 */
export function focusModePlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: focusModeKey,

    props: {
      decorations(state) {
        const { doc, selection } = state
        const { head } = selection

        // Find the top-level block (direct doc child) containing the cursor.
        // We walk doc's children accumulating positions to find the match.
        let focusedBlockStart = -1
        let focusedBlockEnd = -1
        let offset = 0

        for (let i = 0; i < doc.childCount; i++) {
          const child = doc.child(i)
          const start = offset
          const end = offset + child.nodeSize
          // The selection head is inside this block if start < head <= end.
          // (pos 0 = before the doc; a block at offset 0 spans [0, nodeSize-1],
          //  and content inside it starts at offset+1.)
          if (head > start && head <= end) {
            focusedBlockStart = start
            focusedBlockEnd = end
            break
          }
          offset = end
        }

        // Fallback: if the cursor sits exactly at pos 0 (before doc content),
        // treat the first block as focused.
        if (focusedBlockStart === -1 && doc.childCount > 0) {
          focusedBlockStart = 0
          focusedBlockEnd = doc.child(0).nodeSize
        }

        if (focusedBlockStart === -1) return DecorationSet.empty

        // Node decoration: wraps the matched top-level block with a class.
        // The `class` attr is merged onto the block element by ProseMirror.
        const deco = Decoration.node(focusedBlockStart, focusedBlockEnd, {
          class: 'block-focused',
        })

        return DecorationSet.create(doc, [deco])
      },
    },
  })
}
