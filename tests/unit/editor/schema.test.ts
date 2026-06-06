import { describe, it, expect } from 'vitest'
import { type NodeType } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'

/** Look up a node type that must exist, narrowing away `undefined`. */
function nodeType(name: string): NodeType {
  const nt = schema.nodes[name]
  if (!nt) throw new Error(`expected node "${name}" to exist`)
  return nt
}

/** Read the declared default of a node's attribute, asserting it exists. */
function attrDefault(node: NodeType, attr: string): unknown {
  const spec = node.spec.attrs?.[attr]
  if (!spec) throw new Error(`expected attr "${attr}" on node "${node.name}"`)
  return spec.default
}

/**
 * Task 3: the schema is the correctness contract every later task imports.
 * Assert the full node/mark surface exists (18 nodes, 5 marks) and that the
 * WYSIWYG-specific shapes are present and correctly configured.
 */

const EXPECTED_NODES = [
  'doc',
  'paragraph',
  'heading',
  'blockquote',
  'code_block',
  'horizontal_rule',
  'bullet_list',
  'ordered_list',
  'list_item',
  'task_list',
  'task_item',
  'image',
  'hard_break',
  'text',
  'table',
  'table_row',
  'table_cell',
  'table_header',
  'math_inline',
  'math_block',
] as const

const EXPECTED_MARKS = ['strong', 'em', 'code', 'link', 'strikethrough'] as const

describe('schema nodes', () => {
  it('defines all 20 nodes', () => {
    for (const name of EXPECTED_NODES) {
      expect(schema.nodes[name], `node "${name}" missing`).toBeDefined()
    }
    expect(EXPECTED_NODES).toHaveLength(20)
  })

  it('heading carries a level attribute defaulting to 1', () => {
    expect(attrDefault(nodeType('heading'), 'level')).toBe(1)
  })

  it('code_block language attribute defaults to empty string', () => {
    expect(attrDefault(nodeType('code_block'), 'language')).toBe('')
  })

  it('task_item carries a checked attribute defaulting to false', () => {
    expect(attrDefault(nodeType('task_item'), 'checked')).toBe(false)
  })

  it('task_list accepts both task_item and list_item children (KNOWN FIX #1)', () => {
    const taskList = nodeType('task_list')
    expect(taskList.spec.content).toBe('(task_item | list_item)+')
  })

  it('table nodes belong to the block group', () => {
    expect(nodeType('table').spec.group).toContain('block')
  })

  it('math_inline carries a latex attribute defaulting to empty string', () => {
    expect(attrDefault(nodeType('math_inline'), 'latex')).toBe('')
  })

  it('math_block carries a latex attribute defaulting to empty string', () => {
    expect(attrDefault(nodeType('math_block'), 'latex')).toBe('')
  })

  it('math_inline is inline and atom', () => {
    const nt = nodeType('math_inline')
    expect(nt.spec.inline).toBe(true)
    expect(nt.spec.atom).toBe(true)
  })

  it('math_block is a block atom', () => {
    const nt = nodeType('math_block')
    expect(nt.spec.group).toContain('block')
    expect(nt.spec.atom).toBe(true)
  })
})

describe('schema marks', () => {
  it('defines all 5 marks', () => {
    for (const name of EXPECTED_MARKS) {
      expect(schema.marks[name], `mark "${name}" missing`).toBeDefined()
    }
    expect(EXPECTED_MARKS).toHaveLength(5)
  })
})

describe('inline code mark (WYSIWYG parity)', () => {
  it('is non-inclusive so typing past it exits the code styling', () => {
    expect(schema.marks['code']!.spec.inclusive).toBe(false)
  })
})
