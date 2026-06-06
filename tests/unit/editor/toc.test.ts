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

describe('[TOC]', () => {
  it('parses [toc] (lowercase) as a toc atom node', () => {
    const parsed = parseMarkdown('[toc]')
    expect(topTypes(parsed)).toContain('toc')
  })

  it('parses [TOC] (uppercase) as a toc node', () => {
    const parsed = parseMarkdown('[TOC]')
    expect(topTypes(parsed)).toContain('toc')
  })

  it('parses [Toc] (mixed case) as a toc node', () => {
    const parsed = parseMarkdown('[Toc]')
    expect(topTypes(parsed)).toContain('toc')
  })

  it('toc is an atom node (no children)', () => {
    const parsed = parseMarkdown('[toc]\n\n# Title')
    const tocNode = firstOfType(parsed, 'toc')
    expect(tocNode).not.toBeNull()
    expect(tocNode!.childCount).toBe(0)
  })

  it('serializes toc node back to [toc]', () => {
    expect(rt('[toc]')).toBe('[toc]')
  })

  it('round-trip is stable (idempotent)', () => {
    const input = '[toc]\n\n# Heading'
    expect(rt(rt(input))).toBe(rt(input))
  })

  it('[toc] in the middle of a document is recognized', () => {
    const input = '# Intro\n\n[toc]\n\n## Section'
    const parsed = parseMarkdown(input)
    const types = topTypes(parsed)
    expect(types).toContain('toc')
  })

  it('[toc] canonical form round-trips stably', () => {
    // Verify the canonical `[toc]` form is a fixed point under parse/serialize.
    expect(rt('[toc]')).toBe('[toc]')
  })

  it('[toc] inline (mid-paragraph) is NOT treated as a toc atom', () => {
    const parsed = parseMarkdown('See [toc] here.')
    // Inline [toc] should become paragraph text, not a toc node
    expect(topTypes(parsed)).not.toContain('toc')
    expect(topTypes(parsed)).toContain('paragraph')
  })
})
