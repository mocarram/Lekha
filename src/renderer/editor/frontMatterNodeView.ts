/**
 * frontMatterNodeView.ts
 *
 * ProseMirror NodeView for `front_matter` nodes.
 *
 * Design:
 *   - Shows a "Front Matter" label above an editable monospace YAML region.
 *   - ProseMirror manages the text content through `contentDOM` (a <pre>
 *     element), so all cursor placement, selection, and text editing work
 *     naturally without any extra event handling.
 *   - `ignoreMutation`: returns false for mutations inside `contentDOM` (so PM
 *     tracks text edits) and true for everything else.
 *   - No stopEvent override needed since contentDOM is fully PM-managed.
 */

import { type Node } from 'prosemirror-model'
import { type EditorView, type NodeView, type NodeViewConstructor, type ViewMutationRecord } from 'prosemirror-view'

function makeFrontMatterNodeView(
  _node: Node,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  // Outer wrapper
  const dom = document.createElement('div')
  dom.className = 'front-matter'

  // Label affordance
  const label = document.createElement('div')
  label.className = 'front-matter__label'
  label.textContent = 'Front Matter'
  label.setAttribute('contenteditable', 'false')
  dom.appendChild(label)

  // Editable YAML region - ProseMirror manages content inside this element
  const contentDOM = document.createElement('pre')
  contentDOM.className = 'front-matter__content'
  dom.appendChild(contentDOM)

  return {
    dom,
    contentDOM,

    update(updatedNode: Node): boolean {
      return updatedNode.type.name === 'front_matter'
    },

    /**
     * Ignore mutations that come from outside contentDOM (e.g. label).
     * Mutations inside contentDOM must NOT be ignored so PM tracks text edits.
     */
    ignoreMutation(m: ViewMutationRecord): boolean {
      // If the mutation is a selection-change type, let PM handle it
      if (m.type === 'selection') return false
      // Ignore mutations to the label or the wrapper itself
      return !contentDOM.contains(m.target)
    },
  }
}

export const frontMatterNodeView: NodeViewConstructor = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => makeFrontMatterNodeView(node, view, getPos)
