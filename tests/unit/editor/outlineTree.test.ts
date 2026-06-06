/**
 * Unit tests for buildOutlineTree.
 *
 * buildOutlineTree turns the FLAT list produced by getOutline (each item has a
 * `level`) into a nested tree where a heading's children are the subsequent
 * headings of greater level, until a sibling/ancestor of equal-or-lower level.
 */
import { describe, it, expect } from 'vitest'
import { buildOutlineTree } from '../../../src/renderer/editor/outline'
import type { OutlineItem } from '../../../src/shared/types'

function item(level: number, text: string, pos: number): OutlineItem {
  return { level, text, pos }
}

describe('buildOutlineTree', () => {
  it('returns an empty array for no items', () => {
    expect(buildOutlineTree([])).toEqual([])
  })

  it('keeps sibling headings of the same level flat', () => {
    const tree = buildOutlineTree([
      item(1, 'A', 0),
      item(1, 'B', 10),
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0]!.text).toBe('A')
    expect(tree[0]!.children).toHaveLength(0)
    expect(tree[1]!.text).toBe('B')
    expect(tree[1]!.children).toHaveLength(0)
  })

  it('nests H2 under the preceding H1', () => {
    const tree = buildOutlineTree([
      item(1, 'H1', 0),
      item(2, 'H2a', 10),
      item(2, 'H2b', 20),
    ])
    expect(tree).toHaveLength(1)
    const h1 = tree[0]!
    expect(h1.text).toBe('H1')
    expect(h1.children).toHaveLength(2)
    expect(h1.children[0]!.text).toBe('H2a')
    expect(h1.children[1]!.text).toBe('H2b')
  })

  it('handles H1 > H2 > H2, then a new H1 (un-nests to top level)', () => {
    const tree = buildOutlineTree([
      item(1, 'First', 0),
      item(2, 'Sub A', 10),
      item(2, 'Sub B', 20),
      item(1, 'Second', 30),
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0]!.text).toBe('First')
    expect(tree[0]!.children.map((c) => c.text)).toEqual(['Sub A', 'Sub B'])
    expect(tree[1]!.text).toBe('Second')
    expect(tree[1]!.children).toHaveLength(0)
  })

  it('nests a deeper-then-shallower sequence correctly (H1 > H2 > H3, then H2)', () => {
    const tree = buildOutlineTree([
      item(1, 'H1', 0),
      item(2, 'H2a', 10),
      item(3, 'H3', 20),
      item(2, 'H2b', 30),
    ])
    expect(tree).toHaveLength(1)
    const h1 = tree[0]!
    expect(h1.children.map((c) => c.text)).toEqual(['H2a', 'H2b'])
    // H3 nests under H2a, not H2b
    expect(h1.children[0]!.children.map((c) => c.text)).toEqual(['H3'])
    expect(h1.children[1]!.children).toHaveLength(0)
  })

  it('treats a heading deeper than any ancestor as a child of the nearest shallower one', () => {
    // H2 first (no H1 ancestor), then H4 under it, then H3 under H2 too.
    const tree = buildOutlineTree([
      item(2, 'Root', 0),
      item(4, 'Deep', 10),
      item(3, 'Mid', 20),
    ])
    expect(tree).toHaveLength(1)
    const root = tree[0]!
    expect(root.children.map((c) => c.text)).toEqual(['Deep', 'Mid'])
  })

  it('preserves level, text and pos on each node', () => {
    const tree = buildOutlineTree([item(3, 'Only', 42)])
    expect(tree[0]).toMatchObject({ level: 3, text: 'Only', pos: 42 })
    expect(tree[0]!.children).toEqual([])
  })
})
