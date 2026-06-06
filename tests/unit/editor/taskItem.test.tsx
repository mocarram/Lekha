import { describe, it, expect, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { render, cleanup, act } from '@testing-library/react'
import { createRef } from 'react'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import { toggleTaskItem } from '../../../src/renderer/editor/taskItem'
import {
  EditorView,
  type EditorHandle,
} from '../../../src/renderer/editor/EditorView'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the first task_item position in the doc (offset into doc, at the node). */
function findTaskItemPos(state: EditorState): number | null {
  let found: number | null = null
  state.doc.descendants((node, pos): boolean => {
    if (found !== null) return false
    if (node.type.name === 'task_item') {
      found = pos
      return false
    }
    return true
  })
  return found
}

/** Apply `toggleTaskItem(pos)` to the state; return next state or null if declined. */
function applyToggle(state: EditorState, pos: number): EditorState | null {
  let next: EditorState | null = null
  toggleTaskItem(pos)(state, (tr) => {
    next = state.apply(tr)
  })
  return next
}

// ---------------------------------------------------------------------------
// toggleTaskItem command
// ---------------------------------------------------------------------------

describe('toggleTaskItem command', () => {
  it('flips checked=false -> true and serializes as "- [x]"', () => {
    const doc = parseMarkdown('- [ ] todo')
    const state = EditorState.create({ schema, doc })

    const pos = findTaskItemPos(state)
    expect(pos).not.toBeNull()

    const next = applyToggle(state, pos!)
    expect(next).not.toBeNull()

    const taskItemNode = next!.doc.nodeAt(pos!)
    expect(taskItemNode).not.toBeNull()
    expect(taskItemNode!.type.name).toBe('task_item')
    expect(taskItemNode!.attrs['checked']).toBe(true)

    expect(serializeMarkdown(next!.doc).trim()).toBe('- [x] todo')
  })

  it('flips checked=true -> false and serializes as "- [ ]"', () => {
    // Start from already-checked state
    const doc = parseMarkdown('- [ ] todo')
    const state = EditorState.create({ schema, doc })
    const pos = findTaskItemPos(state)!

    // Toggle once: false -> true
    const checked = applyToggle(state, pos)!
    expect(checked.doc.nodeAt(pos)!.attrs['checked']).toBe(true)

    // Toggle again: true -> false
    const unchecked = applyToggle(checked, pos)!
    expect(unchecked.doc.nodeAt(pos)!.attrs['checked']).toBe(false)
    expect(serializeMarkdown(unchecked.doc).trim()).toBe('- [ ] todo')
  })

  it('returns false (declines) when the node at pos is not a task_item', () => {
    const doc = parseMarkdown('hello world')
    const state = EditorState.create({ schema, doc })

    // paragraph is at pos 0 (doc), text is at pos 1 — neither is a task_item
    let dispatched = false
    const result = toggleTaskItem(1)(state, () => {
      dispatched = true
    })
    expect(result).toBe(false)
    expect(dispatched).toBe(false)
  })

  it('returns false for a paragraph node explicitly', () => {
    const doc = parseMarkdown('hello')
    const state = EditorState.create({ schema, doc })

    // pos 0 = doc start, pos 1 = inside paragraph
    const result = toggleTaskItem(0)(state, () => {})
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// NodeView (DOM integration via EditorView component)
// ---------------------------------------------------------------------------

describe('taskItemNodeView (DOM integration)', () => {
  it('renders a task list with input[type=checkbox] elements', () => {
    const { container } = render(
      <EditorView markdown={'- [ ] buy milk\n- [x] done'} />,
    )
    const checkboxes = container.querySelectorAll('input[type="checkbox"]')
    expect(checkboxes.length).toBe(2)
  })

  it('unchecked task item renders an unchecked checkbox', () => {
    const { container } = render(<EditorView markdown="- [ ] unchecked" />)
    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(cb).not.toBeNull()
    expect(cb!.checked).toBe(false)
  })

  it('checked task item renders a checked checkbox', () => {
    const { container } = render(<EditorView markdown="- [x] done" />)
    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(cb).not.toBeNull()
    expect(cb!.checked).toBe(true)
  })

  it('clicking a checkbox flips the underlying doc checked attr', () => {
    const ref = createRef<EditorHandle>()
    const { container } = render(
      <EditorView markdown="- [ ] buy milk" ref={ref} />,
    )

    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    expect(cb).not.toBeNull()

    // Click the checkbox; ProseMirror dispatches the toggle transaction
    act(() => {
      cb!.click()
    })

    // The doc should now have checked=true
    const doc = ref.current!.getDoc()
    let checked: boolean | null = null
    doc.descendants((node): boolean => {
      if (node.type.name === 'task_item') {
        checked = node.attrs['checked'] as boolean
        return false
      }
      return true
    })
    expect(checked).toBe(true)
  })

  it('clicking a checkbox updates getMarkdown() to "- [x]"', () => {
    const ref = createRef<EditorHandle>()
    const { container } = render(
      <EditorView markdown="- [ ] buy milk" ref={ref} />,
    )

    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')
    act(() => {
      cb!.click()
    })

    expect(ref.current!.getMarkdown().trim()).toBe('- [x] buy milk')
  })

  it('checkbox wrapper has contenteditable=false (non-editable)', () => {
    const { container } = render(<EditorView markdown="- [ ] test" />)
    const cb = container.querySelector('input[type="checkbox"]')
    expect(cb).not.toBeNull()
    // The checkbox's parent wrapper should be contenteditable=false
    const wrapper = cb!.parentElement
    expect(wrapper).not.toBeNull()
    expect(wrapper!.getAttribute('contenteditable')).toBe('false')
  })

  it('sets data-checked on the <li> matching the item state (drives the completed-item styling)', () => {
    const { container } = render(
      <EditorView markdown={'- [ ] todo\n- [x] done'} />,
    )
    const items = container.querySelectorAll('li.task-item')
    expect(items.length).toBe(2)
    expect(items[0]!.getAttribute('data-checked')).toBe('false')
    expect(items[1]!.getAttribute('data-checked')).toBe('true')
  })

  it('updates data-checked when the checkbox is toggled', () => {
    const { container } = render(<EditorView markdown="- [ ] buy milk" />)
    const li = container.querySelector('li.task-item')!
    expect(li.getAttribute('data-checked')).toBe('false')

    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    act(() => {
      cb.click()
    })
    expect(li.getAttribute('data-checked')).toBe('true')
  })

  it('reflects the checked property on the input after a click toggle', () => {
    const { container } = render(<EditorView markdown="- [ ] buy milk" />)
    const cb = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    expect(cb.checked).toBe(false)
    act(() => {
      cb.click()
    })
    // The glyph (input.checked), not just the doc attr, must follow the toggle.
    expect(cb.checked).toBe(true)
  })
})
