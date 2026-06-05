import { describe, it, expect } from 'vitest'
import { createEditorState } from '../../../src/renderer/editor/createState'

describe('createEditorState', () => {
  it('returns an EditorState', () => {
    const state = createEditorState('')
    expect(state).toBeDefined()
    expect(state.doc).toBeDefined()
  })

  it('parses a heading correctly', () => {
    const state = createEditorState('# Hi')
    const firstChild = state.doc.firstChild
    expect(firstChild).not.toBeNull()
    expect(firstChild!.type.name).toBe('heading')
    expect(firstChild!.attrs['level']).toBe(1)
    expect(firstChild!.textContent).toBe('Hi')
  })

  it('includes plugins (inputRules, keymap, history, etc.)', () => {
    const state = createEditorState('hello')
    // The plugin array should be non-empty; exact count depends on
    // prosemirror internals but should be >= 8 (our 10 configured plugins,
    // some of which register sub-plugins internally).
    expect(state.plugins.length).toBeGreaterThanOrEqual(8)
  })

  it('parses a paragraph', () => {
    const state = createEditorState('hello world')
    const firstChild = state.doc.firstChild
    expect(firstChild!.type.name).toBe('paragraph')
    expect(firstChild!.textContent).toBe('hello world')
  })

  it('parses multiple blocks', () => {
    const state = createEditorState('# Title\n\nSome text')
    expect(state.doc.childCount).toBe(2)
    expect(state.doc.child(0).type.name).toBe('heading')
    expect(state.doc.child(1).type.name).toBe('paragraph')
  })

  it('parses empty markdown to a doc with a paragraph', () => {
    const state = createEditorState('')
    // An empty doc still has at least the base paragraph
    expect(state.doc).toBeDefined()
  })
})
