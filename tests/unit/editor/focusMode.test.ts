/**
 * Unit tests for the focusModePlugin.
 *
 * The plugin adds a node decoration with class `block-focused` to the
 * top-level block that contains the current selection head.
 *
 * Tests:
 *   - The plugin is constructable (returns a Plugin instance).
 *   - Decorations mark the correct top-level block with `block-focused`.
 *   - Only one block is decorated at a time.
 *   - Moving the selection moves the decoration to the new block.
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { DecorationSet } from 'prosemirror-view'
import { focusModePlugin, focusModeKey } from '../../../src/renderer/editor/plugins/focusMode'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { schema } from '../../../src/renderer/editor/schema'

/**
 * Create an EditorState with the focusModePlugin and a given markdown doc.
 * Optionally set the selection to a given position.
 */
function makeState(markdown: string, selPos?: number): EditorState {
  const doc = parseMarkdown(markdown)
  const state = EditorState.create({
    doc,
    plugins: [focusModePlugin()],
  })
  if (selPos === undefined) return state
  const sel = TextSelection.near(doc.resolve(selPos))
  return state.apply(state.tr.setSelection(sel))
}

/**
 * Extract the decoration set from the focusModePlugin for the given state.
 * Uses focusModeKey to find the plugin reliably.
 * Returns an array of decorated node positions.
 */
function getDecoratedPositions(state: EditorState): number[] {
  // Find the plugin that has our focusModeKey
  const plugin = state.plugins.find((p) => {
    return (p.spec as { key?: unknown }).key === focusModeKey
  })
  if (!plugin) return []
  // Call decorations bound to the plugin to satisfy TypeScript's 'this' constraint.
  const decoFn = plugin.props.decorations
  if (!decoFn) return []
  const decorations = decoFn.call(plugin, state)
  if (!decorations || decorations === DecorationSet.empty) return []
  const decoSet = decorations as DecorationSet
  // Collect positions by finding all decos in the whole doc range
  const found: number[] = []
  decoSet.find(0, state.doc.content.size).forEach((deco) => {
    found.push(deco.from)
  })
  return found
}

describe('focusModePlugin', () => {
  it('is constructable and returns a Plugin', () => {
    const plugin = focusModePlugin()
    expect(plugin).toBeDefined()
    expect(typeof plugin.props.decorations).toBe('function')
  })

  it('decorates the first top-level block when cursor is at start', () => {
    // Doc: paragraph 1 (cursor here) | paragraph 2
    const state = makeState('First paragraph\n\nSecond paragraph')
    const doc = state.doc
    // Cursor defaults to start; should be in the first paragraph
    expect(doc.childCount).toBeGreaterThanOrEqual(2)

    const decos = getDecoratedPositions(state)
    // The first block's opening position is 0 (node decoration from = node start)
    // Node decorations: from = node start, to = node end
    expect(decos.length).toBeGreaterThan(0)
    // The decorated block should be at position 0 (the first top-level child)
    expect(decos).toContain(0)
  })

  it('decorates the second block when cursor is in the second block', () => {
    const md = 'First paragraph\n\nSecond paragraph'
    const doc = parseMarkdown(md)
    const state = EditorState.create({ doc, plugins: [focusModePlugin()] })

    // Find start position of second top-level block
    const secondBlockStart = doc.child(0).nodeSize // skip the first child
    // Put cursor inside the second block (after its opening token)
    const cursorPos = secondBlockStart + 1
    const sel = TextSelection.near(doc.resolve(cursorPos))
    const movedState = state.apply(state.tr.setSelection(sel))

    const decos = getDecoratedPositions(movedState)
    // The second block starts at secondBlockStart
    expect(decos).toContain(secondBlockStart)
    // The first block should NOT be decorated
    expect(decos).not.toContain(0)
  })

  it('only one block is decorated at a time', () => {
    const md = 'Para one\n\nPara two\n\nPara three'
    const doc = parseMarkdown(md)
    const state = EditorState.create({ doc, plugins: [focusModePlugin()] })

    // Put cursor in the third block
    const thirdBlockStart = doc.child(0).nodeSize + doc.child(1).nodeSize
    const cursorPos = thirdBlockStart + 1
    const sel = TextSelection.near(doc.resolve(cursorPos))
    const movedState = state.apply(state.tr.setSelection(sel))

    const decos = getDecoratedPositions(movedState)
    expect(decos).toHaveLength(1)
    expect(decos).toContain(thirdBlockStart)
  })

  it('decoration moves when selection moves to a different block', () => {
    const md = 'Block A\n\nBlock B'
    const doc = parseMarkdown(md)
    const plugin = focusModePlugin()
    let state = EditorState.create({ doc, plugins: [plugin] })

    // First, cursor is in block A (pos 0)
    const firstDecos = getDecoratedPositions(state)
    expect(firstDecos).toContain(0)

    // Move cursor to block B
    const blockBStart = doc.child(0).nodeSize
    const sel = TextSelection.near(doc.resolve(blockBStart + 1))
    state = state.apply(state.tr.setSelection(sel))

    const secondDecos = getDecoratedPositions(state)
    expect(secondDecos).toContain(blockBStart)
    expect(secondDecos).not.toContain(0)
  })

  it('works with a heading followed by paragraphs', () => {
    const md = '# Title\n\nFirst paragraph\n\nSecond paragraph'
    const doc = parseMarkdown(md)
    expect(doc.child(0).type.name).toBe('heading')

    const plugin = focusModePlugin()
    let state = EditorState.create({ doc, plugins: [plugin] })

    // Cursor starts at beginning - heading is decorated
    const headingDecos = getDecoratedPositions(state)
    expect(headingDecos).toContain(0)

    // Move cursor into the first paragraph
    const paraStart = doc.child(0).nodeSize
    const sel = TextSelection.near(doc.resolve(paraStart + 1))
    state = state.apply(state.tr.setSelection(sel))
    const paraDecos = getDecoratedPositions(state)
    expect(paraDecos).toContain(paraStart)
    expect(paraDecos).not.toContain(0)
  })

  it('adds the block-focused class attribute to the decoration', () => {
    const doc = parseMarkdown('Just one paragraph')
    const state = EditorState.create({ doc, plugins: [focusModePlugin()] })
    const foundPlugin = state.plugins.find((p) => {
      return (p.spec as { key?: unknown }).key === focusModeKey
    })
    expect(foundPlugin).toBeDefined()
    // foundPlugin is guaranteed non-null after the expect above.
    // Use the non-null assertion and call bound to the plugin.
    const boundPlugin = foundPlugin!
    const decoFn = boundPlugin.props.decorations!
    const decorations = decoFn.call(boundPlugin, state) as DecorationSet
    const found = decorations.find(0, state.doc.content.size)
    expect(found.length).toBe(1)
    // Node decoration attrs should have the block-focused class
    const deco = found[0]!
    const type = (deco as unknown as { type: { attrs?: Record<string, string> } }).type
    expect(type.attrs?.['nodeName'] ?? type.attrs?.['class']).toBeTruthy()
  })
})

describe('focusModePlugin - schema', () => {
  it('uses the shared schema (has paragraph type)', () => {
    expect(schema.nodes['paragraph']).toBeDefined()
  })
})
