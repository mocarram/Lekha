/**
 * findHighlightPlugin state tests - the DecorationSet must live in plugin
 * state and be REUSED across selection-only transactions (rebuilding it per
 * cursor move was an O(matches) allocation on every transaction while a
 * search was active).
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import {
  findHighlightPlugin,
  findHighlightKey,
} from '../../../src/renderer/editor/plugins/findHighlight'
import { parseMarkdown } from '../../../src/renderer/editor/parser'

function makeState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseMarkdown(markdown),
    plugins: [findHighlightPlugin()],
  })
}

function setQuery(state: EditorState, query: string): EditorState {
  return state.apply(
    state.tr.setMeta(findHighlightKey, { query, caseSensitive: false, wholeWord: false }),
  )
}

describe('findHighlightPlugin - decorations in state', () => {
  it('builds decorations when a query is set', () => {
    const state = setQuery(makeState('alpha beta alpha'), 'alpha')
    const ps = findHighlightKey.getState(state)!
    expect(ps.matches).toHaveLength(2)
    expect(ps.decorations.find(0, state.doc.content.size)).toHaveLength(2)
  })

  it('reuses the same plugin state for selection-only transactions', () => {
    const state = setQuery(makeState('alpha beta alpha'), 'alpha')
    const before = findHighlightKey.getState(state)!
    const next = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)))
    expect(findHighlightKey.getState(next)).toBe(before)
  })

  it('recomputes matches and decorations when the doc changes with an active query', () => {
    const state = setQuery(makeState('alpha beta'), 'alpha')
    const next = state.apply(state.tr.insertText(' alpha', state.doc.content.size - 1))
    const ps = findHighlightKey.getState(next)!
    expect(ps.matches).toHaveLength(2)
    expect(ps.decorations.find(0, next.doc.content.size)).toHaveLength(2)
  })

  it('does not rebuild on doc changes when no query is active', () => {
    const state = makeState('alpha beta')
    const before = findHighlightKey.getState(state)!
    const next = state.apply(state.tr.insertText('x', 3))
    expect(findHighlightKey.getState(next)).toBe(before)
  })

  it('marks the current match with the current class on a current-index update', () => {
    const withQuery = setQuery(makeState('alpha beta alpha'), 'alpha')
    const next = withQuery.apply(withQuery.tr.setMeta(findHighlightKey, { current: 1 }))
    const ps = findHighlightKey.getState(next)!
    expect(ps.current).toBe(1)
    const decos = ps.decorations.find(0, next.doc.content.size)
    const classes = decos.map(
      (d) => (d as unknown as { type: { attrs: Record<string, string> } }).type.attrs['class'],
    )
    expect(classes.filter((c) => c?.includes('find-match--current'))).toHaveLength(1)
  })
})
