/**
 * tocNodeView.ts
 *
 * ProseMirror NodeView for `toc` (table of contents) atoms.
 *
 * Design:
 *   - Atom node: no contentDOM; ProseMirror treats it as a single opaque unit.
 *   - `update()` is called on every document change. We re-read the current
 *     document via `view.state.doc` and re-render the TOC entries so the
 *     table of contents always reflects the current headings.
 *   - Each TOC entry is a clickable element that scrolls to the heading using
 *     ProseMirror's coordsAtPos approach (matching the Outline panel pattern).
 *   - `ignoreMutation`: always returns true (atom node, we own the DOM).
 *   - `stopEvent`: returns true to prevent PM interfering with link clicks.
 *   - Clean `destroy()`: removes click handlers from entries.
 */

import { type Node } from 'prosemirror-model'
import { TextSelection } from 'prosemirror-state'
import { type EditorView, type NodeView, type NodeViewConstructor } from 'prosemirror-view'
import { getOutline } from './outline'
import type { OutlineItem } from '@shared/types'

function makeTocNodeView(
  _node: Node,
  view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  const dom = document.createElement('div')
  dom.className = 'toc'
  dom.setAttribute('contenteditable', 'false')

  // Label
  const label = document.createElement('div')
  label.className = 'toc__label'
  label.textContent = 'Table of Contents'
  dom.appendChild(label)

  // Entries container
  const list = document.createElement('ul')
  list.className = 'toc__list'
  dom.appendChild(list)

  // Keep track of cleanup handlers for destroy()
  let cleanupFns: (() => void)[] = []

  function renderEntries(items: OutlineItem[]): void {
    // Clear previous entries and cleanup handlers
    cleanupFns.forEach((fn) => fn())
    cleanupFns = []
    list.innerHTML = ''

    if (items.length === 0) {
      const empty = document.createElement('li')
      empty.className = 'toc__empty'
      empty.textContent = 'No headings found'
      list.appendChild(empty)
      return
    }

    for (const item of items) {
      const li = document.createElement('li')
      li.className = `toc__item toc__item--h${item.level}`
      li.style.paddingLeft = `${(item.level - 1) * 16}px`

      const link = document.createElement('a')
      link.className = 'toc__link'
      link.textContent = item.text
      link.href = '#'

      const pos = item.pos

      const handleClick = (e: Event): void => {
        e.preventDefault()
        // Scroll to the heading position in the editor
        const { doc } = view.state
        const safePos = Math.min(Math.max(pos + 1, 0), doc.content.size)
        const selection = TextSelection.near(doc.resolve(safePos))
        const tr = view.state.tr.setSelection(selection).scrollIntoView()
        view.dispatch(tr)
        view.focus()
      }

      link.addEventListener('click', handleClick)
      cleanupFns.push(() => link.removeEventListener('click', handleClick))

      li.appendChild(link)
      list.appendChild(li)
    }
  }

  // Initial render
  renderEntries(getOutline(view.state.doc))

  return {
    dom,

    /**
     * Called on every document change. Re-render the TOC from the latest
     * heading set so it stays live as the user edits.
     */
    update(updatedNode: Node): boolean {
      if (updatedNode.type.name !== 'toc') return false
      renderEntries(getOutline(view.state.doc))
      return true
    },

    /** Atom node: always ignore DOM mutations (we own all inner DOM). */
    ignoreMutation(): boolean {
      return true
    },

    /** Stop events inside the TOC from reaching ProseMirror. */
    stopEvent(event: Event): boolean {
      return dom.contains(event.target as globalThis.Node)
    },

    /** Clean up all click handlers on destroy. */
    destroy(): void {
      cleanupFns.forEach((fn) => fn())
      cleanupFns = []
    },
  }
}

export const tocNodeView: NodeViewConstructor = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => makeTocNodeView(node, view, getPos)
