import { type Node } from 'prosemirror-model'
import { type Command } from 'prosemirror-state'
import { type EditorView, type NodeView } from 'prosemirror-view'

// ---------------------------------------------------------------------------
// toggleTaskItem command
// ---------------------------------------------------------------------------

/**
 * ProseMirror Command that flips the `checked` attribute of the `task_item`
 * node at the given absolute position. Returns false (declines) if the node
 * at `pos` is not a `task_item`.
 *
 * Usage: `toggleTaskItem(getPos())(state, dispatch)`
 */
export function toggleTaskItem(pos: number): Command {
  return (state, dispatch) => {
    const node = state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'task_item') return false

    if (dispatch) {
      const checked = node.attrs['checked'] as boolean
      const tr = state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        checked: !checked,
      })
      dispatch(tr)
    }
    return true
  }
}

// ---------------------------------------------------------------------------
// taskItemNodeView factory
// ---------------------------------------------------------------------------

/**
 * NodeView for `task_item` nodes.
 *
 * Renders as:
 *   <li class="task-item">
 *     <span contenteditable="false"><input type="checkbox" /></span>
 *     <span><!-- contentDOM: ProseMirror mounts item text here --></span>
 *   </li>
 *
 * The checkbox wrapper is `contenteditable=false` so clicks toggle the checked
 * state rather than placing a ProseMirror cursor. The checkbox `checked`
 * property mirrors the node's `checked` attribute and stays in sync via
 * `update()`.
 */
export function taskItemNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  // Outer <li>
  const dom = document.createElement('li')
  dom.className = 'task-item'

  // Non-editable wrapper so clicks reach the checkbox, not the cursor handler
  const checkboxWrapper = document.createElement('span')
  checkboxWrapper.setAttribute('contenteditable', 'false')

  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.checked = node.attrs['checked'] as boolean

  // Toggle on click: dispatch the command through the live EditorView.
  // Kept as a named reference so destroy() can remove the same listener.
  const handleClick = (e: MouseEvent): void => {
    e.preventDefault()
    const pos = getPos()
    if (pos === undefined) return
    toggleTaskItem(pos)(view.state, view.dispatch)
  }

  checkbox.addEventListener('click', handleClick)

  checkboxWrapper.appendChild(checkbox)
  dom.appendChild(checkboxWrapper)

  // contentDOM: ProseMirror renders the item's child content inside this span
  const contentDOM = document.createElement('span')
  dom.appendChild(contentDOM)

  return {
    dom,
    contentDOM,

    /**
     * Called by ProseMirror whenever the node's attrs or content change.
     * Sync the checkbox reflected state without touching the DOM structure.
     * Return true to signal we handled the update; return false only if the
     * node type changed (ProseMirror will then destroy and re-create the view).
     */
    update(updatedNode: Node): boolean {
      if (updatedNode.type.name !== 'task_item') return false
      // Keep checkbox in sync with the latest `checked` attr
      checkbox.checked = updatedNode.attrs['checked'] as boolean
      return true
    },

    /** Remove the click listener when ProseMirror tears down this NodeView. */
    destroy(): void {
      checkbox.removeEventListener('click', handleClick)
    },
  }
}
