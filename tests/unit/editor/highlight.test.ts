import { schema } from '@renderer/editor/schema'
import { highlightPlugin } from '@renderer/editor/plugins/highlight'
import { EditorState } from 'prosemirror-state'
import type { DecorationSet } from 'prosemirror-view'
import { parseMarkdown } from '@renderer/editor/parser'
import { it, expect } from 'vitest'

it('decorates code blocks for a known language', () => {
  const doc = parseMarkdown('```js\nconst x = 1\n```')
  const plugin = highlightPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  const decos = plugin.props.decorations?.call(plugin, state)
  expect(decos).toBeTruthy()
  // there should be at least one inline decoration span inside the code block
  expect((decos as DecorationSet).find().length).toBeGreaterThan(0)
})

it('produces no decorations for an unknown/empty language gracefully', () => {
  const doc = parseMarkdown('```\nplain text\n```')
  const plugin = highlightPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  // must not throw; decorations may be empty
  expect(() => plugin.props.decorations?.call(plugin, state)).not.toThrow()
})

it('does not throw on a doc with no code blocks', () => {
  const doc = parseMarkdown('# Just a heading\n\nsome text')
  const plugin = highlightPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  expect(() => plugin.props.decorations?.call(plugin, state)).not.toThrow()
})

it('recomputes decoration positions when the same code block sits at a different document position', () => {
  // Doc A: code block near the start of the document (no heading above it).
  const docA = parseMarkdown('```js\nconst x = 1\n```')
  // Doc B: identical code block but shifted down by a heading above it.
  const docB = parseMarkdown('# Heading\n\n```js\nconst x = 1\n```')

  const plugin = highlightPlugin()

  const stateA = EditorState.create({ schema, doc: docA, plugins: [plugin] })
  const stateB = EditorState.create({ schema, doc: docB, plugins: [plugin] })

  const decosA = plugin.props.decorations?.call(plugin, stateA) as DecorationSet
  const decosB = plugin.props.decorations?.call(plugin, stateB) as DecorationSet

  const foundA = decosA.find()
  const foundB = decosB.find()

  // Both docs produce decorations for the identical JS snippet.
  expect(foundA.length).toBeGreaterThan(0)
  expect(foundB.length).toBeGreaterThan(0)

  // The two sets must have the same number of spans (same content, same tokens).
  expect(foundB.length).toBe(foundA.length)

  // Locate each code_block in its document so we can verify range bounds.
  let blockStartA = -1
  docA.descendants((node, pos) => {
    if (node.type.name === 'code_block') { blockStartA = pos; return false }
    return true
  })
  let blockStartB = -1
  docB.descendants((node, pos) => {
    if (node.type.name === 'code_block') { blockStartB = pos; return false }
    return true
  })

  // The heading pushes the block to a higher position in doc B.
  expect(blockStartB).toBeGreaterThan(blockStartA)

  // Every decoration in set A must fall within doc A's code block.
  const codeA = docA.nodeAt(blockStartA)!
  const blockEndA = blockStartA + codeA.nodeSize
  for (const d of foundA) {
    expect(d.from).toBeGreaterThanOrEqual(blockStartA + 1)
    expect(d.to).toBeLessThanOrEqual(blockEndA)
  }

  // Every decoration in set B must fall within doc B's code block (different range).
  const codeB = docB.nodeAt(blockStartB)!
  const blockEndB = blockStartB + codeB.nodeSize
  for (const d of foundB) {
    expect(d.from).toBeGreaterThanOrEqual(blockStartB + 1)
    expect(d.to).toBeLessThanOrEqual(blockEndB)
  }

  // Decorations in B must be shifted by exactly (blockStartB - blockStartA)
  // relative to A, proving positions are recomputed from the current blockStart
  // rather than reused from the cached hast entry.
  const shift = blockStartB - blockStartA
  expect(shift).toBeGreaterThan(0)
  foundA.forEach((dA, i) => {
    const dB = foundB[i]
    expect(dB).toBeDefined()
    // Non-null assertion is safe: we already asserted foundB.length === foundA.length above.
    expect(dB!.from).toBe(dA.from + shift)
    expect(dB!.to).toBe(dA.to + shift)
  })
})
