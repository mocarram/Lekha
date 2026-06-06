/**
 * activeBlock.ts - ProseMirror plugin that marks the "active" top-level block.
 *
 * The block (direct child of the doc) containing the selection head receives a
 * node decoration with class `is-active-block`. Unlike focusMode (which gates
 * its visual effect behind a `.focus-mode` container class), this plugin is
 * always meaningful: CSS uses `.is-active-block` to reveal otherwise-hidden UI.
 *
 * Primary consumer: diagram code blocks. A `mermaid` block hides its editable
 * source by default and shows only the rendered diagram; when the block is the
 * active block, the source is revealed alongside the live preview. The show/
 * hide gating itself lives entirely in CSS (github.css, section 15) - this
 * plugin only supplies the `is-active-block` class that CSS keys off.
 *
 * Decorations recompute on every state change, so the class follows the cursor
 * as the user navigates between blocks.
 */

import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { findActiveTopLevelBlock } from './topLevelBlock'

// Exported key so tests can look up the plugin by key name.
export const activeBlockKey = new PluginKey<DecorationSet>('activeBlock')

/**
 * Return a ProseMirror Plugin that decorates the active top-level block with
 * a node decoration carrying `class: 'is-active-block'`.
 */
export function activeBlockPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: activeBlockKey,

    props: {
      decorations(state) {
        const block = findActiveTopLevelBlock(state)
        if (!block) return DecorationSet.empty

        const deco = Decoration.node(block.from, block.to, {
          class: 'is-active-block',
        })

        return DecorationSet.create(state.doc, [deco])
      },
    },
  })
}
