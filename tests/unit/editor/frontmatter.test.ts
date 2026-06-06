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

describe('YAML front-matter', () => {
  const fm = '---\ntitle: Hi\nauthor: Me\n---'
  const doc = '# Heading\n\nSome content.'

  it('parses a leading front-matter block as front_matter node', () => {
    const parsed = parseMarkdown(`${fm}\n\n${doc}`)
    expect(topTypes(parsed)[0]).toBe('front_matter')
  })

  it('front_matter node holds the raw YAML as text content', () => {
    const parsed = parseMarkdown(`${fm}\n\n${doc}`)
    const fmNode = firstOfType(parsed, 'front_matter')
    expect(fmNode).not.toBeNull()
    expect(fmNode!.textContent).toBe('title: Hi\nauthor: Me')
  })

  it('serializes front_matter back to ---\\n<yaml>\\n---', () => {
    const input = `${fm}\n\n${doc}`
    const serialized = rt(input)
    expect(serialized).toContain('---\ntitle: Hi\nauthor: Me\n---')
  })

  it('round-trip is stable (idempotent)', () => {
    const input = `${fm}\n\n${doc}`
    expect(rt(rt(input))).toBe(rt(input))
  })

  it('does NOT treat a mid-document --- as front-matter', () => {
    const midDoc = `${doc}\n\n${fm}`
    const parsed = parseMarkdown(midDoc)
    // No front_matter node should appear; the --- becomes an hr
    expect(topTypes(parsed)).not.toContain('front_matter')
  })

  it('parses a document with only front-matter', () => {
    const parsed = parseMarkdown(fm)
    expect(topTypes(parsed)[0]).toBe('front_matter')
  })

  it('front-matter is the first block, followed by other nodes', () => {
    const input = `${fm}\n\n# Title\n\nParagraph.`
    const parsed = parseMarkdown(input)
    const types = topTypes(parsed)
    expect(types[0]).toBe('front_matter')
    expect(types[1]).toBe('heading')
    expect(types[2]).toBe('paragraph')
  })
})
