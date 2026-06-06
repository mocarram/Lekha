import { describe, it, expect } from 'vitest'
import { type Node } from 'prosemirror-model'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

/** Collect the names of a doc's top-level block children. */
function topTypes(doc: Node): string[] {
  const types: string[] = []
  doc.forEach((child) => types.push(child.type.name))
  return types
}

/** Find the first descendant node of the given type, or null. */
function firstOfType(doc: Node, type: string): Node | null {
  let found: Node | null = null
  doc.descendants((node) => {
    if (!found && node.type.name === type) found = node
    return found === null
  })
  return found
}

describe('Footnotes', () => {
  const footnoteMd = 'Text[^1].\n\n[^1]: A note.'

  it('parses [^1] reference as footnote_ref inline node', () => {
    const parsed = parseMarkdown(footnoteMd)
    const ref = firstOfType(parsed, 'footnote_ref')
    expect(ref).not.toBeNull()
    expect(ref!.attrs['label']).toBe('1')
  })

  it('parses [^1]: definition as footnote_definition block node', () => {
    const parsed = parseMarkdown(footnoteMd)
    const def = firstOfType(parsed, 'footnote_definition')
    expect(def).not.toBeNull()
    expect(def!.attrs['label']).toBe('1')
  })

  it('footnote_definition contains the definition text', () => {
    const parsed = parseMarkdown(footnoteMd)
    const def = firstOfType(parsed, 'footnote_definition')
    expect(def).not.toBeNull()
    expect(def!.textContent).toBe('A note.')
  })

  it('round-trip is stable (idempotent)', () => {
    const once = rt(footnoteMd)
    expect(once).toBe(footnoteMd)
    expect(rt(once)).toBe(once)
  })

  it('round-trip preserves non-numeric labels', () => {
    const md = 'See[^note].\n\n[^note]: Detailed explanation.'
    expect(rt(md)).toBe(md)
    expect(rt(rt(md))).toBe(rt(md))
  })

  it('multiple footnotes round-trip stably', () => {
    const md = 'A[^1] and B[^2].\n\n[^1]: First.\n\n[^2]: Second.'
    expect(rt(md)).toBe(md)
  })

  it('serializes footnote_ref as [^label]', () => {
    const serialized = rt(footnoteMd)
    expect(serialized).toContain('[^1]')
  })

  it('serializes footnote_definition as [^label]: content', () => {
    const serialized = rt(footnoteMd)
    expect(serialized).toContain('[^1]: A note.')
  })

  it('footnote_ref is an inline atom', () => {
    const parsed = parseMarkdown(footnoteMd)
    const ref = firstOfType(parsed, 'footnote_ref')
    expect(ref).not.toBeNull()
    expect(ref!.isAtom).toBe(true)
    expect(ref!.isInline).toBe(true)
  })

  it('footnote_definition is a block node', () => {
    const parsed = parseMarkdown(footnoteMd)
    const def = firstOfType(parsed, 'footnote_definition')
    expect(def).not.toBeNull()
    expect(def!.isBlock).toBe(true)
  })

  it('footnote_definition block appears in top-level blocks', () => {
    const parsed = parseMarkdown(footnoteMd)
    expect(topTypes(parsed)).toContain('footnote_definition')
  })

  it('document order is preserved: paragraph before definition', () => {
    const parsed = parseMarkdown(footnoteMd)
    const types = topTypes(parsed)
    const paraIdx = types.indexOf('paragraph')
    const defIdx = types.indexOf('footnote_definition')
    expect(paraIdx).toBeLessThan(defIdx)
  })
})
