/**
 * Unit tests for the activeBlockPlugin.
 *
 * The plugin adds a node decoration with class `is-active-block` to the
 * top-level block that contains the current selection head. CSS keys off this
 * class to reveal otherwise-hidden UI (notably diagram code-block source).
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import {
  activeBlockPlugin,
  activeBlockKey,
} from '../../../src/renderer/editor/plugins/activeBlock'
import { parseMarkdown } from '../../../src/renderer/editor/parser'

/** Collect the `from` positions of all decorations the plugin produces. */
function getDecoratedPositions(state: EditorState): number[] {
  const plugin = state.plugins.find(
    (p) => (p.spec as { key?: unknown }).key === activeBlockKey,
  )
  if (!plugin) return []
  const decoFn = plugin.props.decorations
  if (!decoFn) return []
  const decorations = decoFn.call(plugin, state)
  if (!decorations || decorations === DecorationSet.empty) return []
  const decoSet = decorations as DecorationSet
  return decoSet.find(0, state.doc.content.size).map((d) => d.from)
}

describe('activeBlockPlugin', () => {
  it('is constructable and returns a Plugin', () => {
    const plugin = activeBlockPlugin()
    expect(plugin).toBeDefined()
    expect(typeof plugin.props.decorations).toBe('function')
  })

  it('marks the first block when the cursor is at the start', () => {
    const doc = parseMarkdown('First\n\nSecond')
    const state = EditorState.create({ doc, plugins: [activeBlockPlugin()] })
    const decos = getDecoratedPositions(state)
    expect(decos).toContain(0)
  })

  it('marks the block containing the selection head', () => {
    const doc = parseMarkdown('First\n\nSecond')
    const state = EditorState.create({ doc, plugins: [activeBlockPlugin()] })
    const secondStart = doc.child(0).nodeSize
    const sel = TextSelection.near(doc.resolve(secondStart + 1))
    const moved = state.apply(state.tr.setSelection(sel))
    const decos = getDecoratedPositions(moved)
    expect(decos).toContain(secondStart)
    expect(decos).not.toContain(0)
  })

  it('only one block is decorated at a time', () => {
    const doc = parseMarkdown('A\n\nB\n\nC')
    const state = EditorState.create({ doc, plugins: [activeBlockPlugin()] })
    const decos = getDecoratedPositions(state)
    expect(decos).toHaveLength(1)
  })

  it('decoration carries the is-active-block class', () => {
    const doc = parseMarkdown('Only one paragraph')
    const state = EditorState.create({ doc, plugins: [activeBlockPlugin()] })
    const plugin = state.plugins.find(
      (p) => (p.spec as { key?: unknown }).key === activeBlockKey,
    )!
    const decorations = plugin.props.decorations!.call(
      plugin,
      state,
    ) as DecorationSet
    const found = decorations.find(0, state.doc.content.size)
    expect(found.length).toBe(1)
    const type = (found[0] as unknown as { type: { attrs?: Record<string, string> } }).type
    expect(type.attrs?.['class']).toBe('is-active-block')
  })

  it('marks a diagram code_block when the cursor is inside it', () => {
    const doc = parseMarkdown('```mermaid\ngraph TD;A-->B;\n```')
    const state = EditorState.create({ doc, plugins: [activeBlockPlugin()] })
    // Cursor at start lands in the only block (the code_block at pos 0).
    const decos = getDecoratedPositions(state)
    expect(decos).toContain(0)
  })
})
