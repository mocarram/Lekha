import { schema } from '@renderer/editor/schema'
import {
  highlightPlugin,
  highlightPluginKey,
  whenLanguagesReady,
} from '@renderer/editor/plugins/highlight'
import { EditorState } from 'prosemirror-state'
import { TextSelection } from 'prosemirror-state'
import type { DecorationSet } from 'prosemirror-view'
import { parseMarkdown } from '@renderer/editor/parser'
import { it, expect, beforeAll, vi } from 'vitest'

// The lowlight grammar set is now lazy-loaded (dynamic import). Ensure it has
// resolved before any test reads decorations synchronously, so the highlighter
// behaves exactly as it did when grammars were loaded eagerly at module scope.
beforeAll(async () => {
  await whenLanguagesReady()
})

// Read the maintained DecorationSet from plugin state (decorations() returns it).
function decosOf(state: EditorState): DecorationSet {
  return highlightPluginKey.getState(state) as DecorationSet
}

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

// ---------------------------------------------------------------------------
// Incremental decoration maintenance (perf)
// ---------------------------------------------------------------------------

it('reuses the SAME DecorationSet instance for a selection-only transaction', () => {
  const doc = parseMarkdown('```js\nconst x = 1\n```\n\nsome text')
  const plugin = highlightPlugin()
  let state = EditorState.create({ schema, doc, plugins: [plugin] })

  const before = decosOf(state)
  expect(before.find().length).toBeGreaterThan(0)

  // Move the cursor without changing the document (selection-only tx).
  const sel = TextSelection.create(state.doc, state.doc.content.size)
  state = state.apply(state.tr.setSelection(sel))

  const after = decosOf(state)
  // Selection-only transactions must NOT rebuild the set - same instance reused
  // (identity equality), proving no re-highlight work was done.
  expect(after).toBe(before)
})

it('does no highlighting work on a selection-only transaction (no re-decorate)', () => {
  const doc = parseMarkdown('```js\nconst x = 1\n```')
  const plugin = highlightPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })

  // Spy on descendants AFTER the initial build. A selection-only tx must not
  // trigger a full doc walk inside the plugin's apply().
  const spy = vi.spyOn(state.doc, 'descendants')
  const sel = TextSelection.create(state.doc, 1)
  void state.apply(state.tr.setSelection(sel))
  expect(spy).not.toHaveBeenCalled()
  spy.mockRestore()
})

it('re-decorates a code block after its content changes', () => {
  const doc = parseMarkdown('```js\nconst x = 1\n```')
  const plugin = highlightPlugin()
  let state = EditorState.create({ schema, doc, plugins: [plugin] })

  const before = decosOf(state).find().length
  expect(before).toBeGreaterThan(0)

  // Insert text inside the code block (content begins at pos 1).
  state = state.apply(state.tr.insertText(' + 2', state.doc.content.size - 1))

  const after = decosOf(state)
  // Still highlighted (decorations rebuilt for the changed block).
  expect(after.find().length).toBeGreaterThan(0)
})
