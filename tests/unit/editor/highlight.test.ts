import { schema } from '@renderer/editor/schema'
import { highlightPlugin } from '@renderer/editor/plugins/highlight'
import { EditorState } from 'prosemirror-state'
import { parseMarkdown } from '@renderer/editor/parser'
import { it, expect } from 'vitest'

it('decorates code blocks for a known language', () => {
  const doc = parseMarkdown('```js\nconst x = 1\n```')
  const plugin = highlightPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  const decos = plugin.props.decorations?.call(plugin, state)
  expect(decos).toBeTruthy()
  // there should be at least one inline decoration span inside the code block
  expect((decos as unknown as { find: () => unknown[] }).find().length).toBeGreaterThan(0)
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
