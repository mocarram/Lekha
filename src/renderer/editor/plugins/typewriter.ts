/**
 * typewriter.ts - ProseMirror plugin for Typewriter Mode.
 *
 * Typewriter mode keeps the cursor's line vertically centered in the editor's
 * scroll container as the user types or moves the caret.
 *
 * APPROACH:
 *   - This plugin is always active (never reconfigured on toggle).
 *   - It uses the `view` spec to register a lifecycle that hooks into every
 *     `update()` call after each transaction.
 *   - The plugin reads the active-state flag from the DOM: if the closest
 *     ancestor element matching `[data-typewriter="on"]` exists, typewriter
 *     mode is active. No store subscription needed - the component sets the
 *     attribute on the container and the plugin reads it on each update.
 *   - This design avoids reconfiguring the plugin when the user toggles the
 *     mode; the attribute change on the container is sufficient.
 *
 * CENTERING MATH:
 *   1. Get the caret bounding rect via `view.coordsAtPos(selection.head)`.
 *      `coords.top` is the viewport-relative top of the caret.
 *   2. Get the scroll container's viewport rect via `getBoundingClientRect()`.
 *   3. The desired caret position is the center of the container:
 *        containerCenter = containerRect.top + containerRect.height / 2
 *   4. The adjustment needed is:
 *        delta = coords.top - containerCenter
 *   5. Apply: scrollContainer.scrollTop += delta
 *
 *   Guard: if coords.top === 0 (no layout / test env), skip the adjustment to
 *   avoid spurious scroll jumps.
 *
 * ACTIVE FLAG:
 *   The scroll container element must have `data-typewriter="on"` to activate
 *   centering. The EditorPane component sets this attribute when
 *   `editorStore.typewriterMode` is true. We search upward from `view.dom`
 *   using `closest('[data-typewriter="on"]')`.
 */

import { Plugin } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { EditorState } from 'prosemirror-state'

/**
 * Return a ProseMirror Plugin that centers the caret line in typewriter mode.
 *
 * The plugin is always-on; the centering is gated by the presence of
 * `data-typewriter="on"` on an ancestor element (set by the React component).
 */
export function typewriterPlugin(): Plugin {
  return new Plugin({
    view(_editorView: EditorView) {
      // Track the previous selection head so we only scroll when it actually moves.
      let prevHead = -1

      return {
        update(view: EditorView, prevState: EditorState) {
          const { selection } = view.state
          const { head } = selection

          // Only scroll when the selection head moved.
          if (head === prevHead && view.state === prevState) return
          prevHead = head

          // Check if typewriter mode is active by looking for the sentinel attr
          // on the nearest scroll container ancestor.
          const scrollContainer = view.dom.closest('[data-typewriter="on"]')

          if (!scrollContainer) return

          // Get the caret's current viewport position.
          const coords = view.coordsAtPos(head)

          // Guard: zero coords means no real layout (e.g. test environment).
          // Skip the scroll adjustment to avoid spurious jumps.
          if (coords.top === 0) return

          // Compute how far we need to scroll to center the caret.
          const containerRect = scrollContainer.getBoundingClientRect()
          const containerCenter = containerRect.top + containerRect.height / 2
          const delta = coords.top - containerCenter

          // Applying the delta to scrollTop shifts the content so the caret
          // lands at the container's vertical center.
          scrollContainer.scrollTop += delta
        },
      }
    },
  })
}
