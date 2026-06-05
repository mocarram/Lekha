import { describe, it, expect } from 'vitest'
import { type Node } from 'prosemirror-model'
import { parseMarkdown } from '../../../src/renderer/editor/parser'

/** Collect the names of a doc's top-level block children. */
function topTypes(doc: Node): string[] {
  const types: string[] = []
  doc.forEach((child) => types.push(child.type.name))
  return types
}

/** Find the first descendant node of the given type, or throw. */
function firstOfType(doc: Node, type: string): Node {
  let found: Node | null = null
  doc.descendants((node) => {
    if (!found && node.type.name === type) found = node
    return found === null
  })
  if (!found) throw new Error(`no "${type}" node in doc`)
  return found
}

/** Does the doc contain a text node carrying the named mark? */
function hasMark(doc: Node, markName: string, text: string): boolean {
  let found = false
  doc.descendants((node) => {
    if (
      node.isText &&
      node.text === text &&
      node.marks.some((m) => m.type.name === markName)
    ) {
      found = true
    }
  })
  return found
}

describe('parseMarkdown', () => {
  it('parses an ATX heading with its level', () => {
    const heading = firstOfType(parseMarkdown('## Title'), 'heading')
    expect(heading.attrs['level']).toBe(2)
    expect(heading.textContent).toBe('Title')
  })

  it('parses strong and strikethrough inline marks', () => {
    const doc = parseMarkdown('a **b** ~~c~~')
    expect(hasMark(doc, 'strong', 'b')).toBe(true)
    expect(hasMark(doc, 'strikethrough', 'c')).toBe(true)
  })

  it('parses em', () => {
    expect(hasMark(parseMarkdown('an *italic* word'), 'em', 'italic')).toBe(true)
  })

  it('parses a fenced code block with its language', () => {
    const fence = firstOfType(parseMarkdown('```js\nconst x = 1\n```'), 'code_block')
    expect(fence.attrs['language']).toBe('js')
    expect(fence.textContent).toBe('const x = 1')
  })

  it('parses a checkbox list into a task_list with task_items', () => {
    const doc = parseMarkdown('- [x] done\n- [ ] todo')
    expect(topTypes(doc)).toContain('task_list')
    const taskList = firstOfType(doc, 'task_list')
    expect(taskList.childCount).toBe(2)
    const items: Node[] = []
    taskList.forEach((c) => items.push(c))
    expect(items.every((i) => i.type.name === 'task_item')).toBe(true)
    const [first, second] = [taskList.child(0), taskList.child(1)]
    expect(first.attrs['checked']).toBe(true)
    expect(second.attrs['checked']).toBe(false)
    expect(first.textContent).toBe('done')
    expect(second.textContent).toBe('todo')
  })

  it('parses a GFM table into table/row/cell/header nodes', () => {
    const doc = parseMarkdown('| H1 | H2 |\n| --- | --- |\n| a | b |')
    expect(topTypes(doc)).toContain('table')
    const table = firstOfType(doc, 'table')
    expect(firstOfType(table, 'table_header').textContent).toBe('H1')
    expect(firstOfType(table, 'table_cell').textContent).toBe('a')
  })

  it('parses a plain bullet list (no checkboxes) as bullet_list', () => {
    const doc = parseMarkdown('- one\n- two')
    expect(topTypes(doc)).toContain('bullet_list')
    expect(topTypes(doc)).not.toContain('task_list')
  })

  it('parses an ordered list', () => {
    expect(topTypes(parseMarkdown('1. one\n2. two'))).toContain('ordered_list')
  })

  it('parses a blockquote', () => {
    const doc = parseMarkdown('> quoted')
    expect(topTypes(doc)).toContain('blockquote')
    expect(firstOfType(doc, 'blockquote').textContent).toBe('quoted')
  })
})
