import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection, type Command } from 'prosemirror-state'
import { schema } from '../../../src/renderer/editor/schema'
import { keymapBindings } from '../../../src/renderer/editor/keymap'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a state with a paragraph containing `text`, all selected. */
function stateWithSelection(text: string): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  const selection = TextSelection.create(doc, 1, 1 + text.length)
  return EditorState.create({ schema, doc, selection })
}

/** Create a state with a paragraph containing `text`, cursor at end. */
function stateWithText(text: string): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  return EditorState.create({ schema, doc })
}

/**
 * Apply `cmd` to `state`.
 * Returns the new state if the command fired, or null if it declined.
 */
function applyCmd(state: EditorState, cmd: Command): EditorState | null {
  let result: EditorState | null = null
  cmd(state, (tr) => {
    result = state.apply(tr)
  })
  return result
}

/** Does any text node in the state carry the given mark? */
function hasMark(state: EditorState, markName: string): boolean {
  let found = false
  state.doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === markName)) {
      found = true
    }
  })
  return found
}

// ---------------------------------------------------------------------------
// All bindings
// ---------------------------------------------------------------------------

const bindings = keymapBindings(schema)

describe('keymapBindings - exported keys', () => {
  it('exports Mod-b binding', () => {
    expect(bindings['Mod-b']).toBeDefined()
  })

  it('exports Mod-i binding', () => {
    expect(bindings['Mod-i']).toBeDefined()
  })

  it('exports Mod-Shift-x binding', () => {
    expect(bindings['Mod-Shift-x']).toBeDefined()
  })

  it('exports Mod-` binding', () => {
    expect(bindings['Mod-`']).toBeDefined()
  })

  it('exports Mod-z (undo)', () => {
    expect(bindings['Mod-z']).toBeDefined()
  })

  it('exports Mod-y (redo)', () => {
    expect(bindings['Mod-y']).toBeDefined()
  })

  it('exports Mod-Shift-z (redo)', () => {
    expect(bindings['Mod-Shift-z']).toBeDefined()
  })

  it('exports Enter (list split)', () => {
    expect(bindings['Enter']).toBeDefined()
  })

  it('exports Tab (sink list item)', () => {
    expect(bindings['Tab']).toBeDefined()
  })

  it('exports Shift-Tab (lift list item)', () => {
    expect(bindings['Shift-Tab']).toBeDefined()
  })

  it('exports Mod-Alt-1 through Mod-Alt-6', () => {
    for (let i = 1; i <= 6; i++) {
      expect(bindings[`Mod-Alt-${i}`], `Mod-Alt-${i} missing`).toBeDefined()
    }
  })

  it('exports Mod-Alt-0 (paragraph)', () => {
    expect(bindings['Mod-Alt-0']).toBeDefined()
  })
})

describe('keymapBindings - mark toggles', () => {
  it('Mod-b applies strong to selected text', () => {
    const state = stateWithSelection('hello')
    const next = applyCmd(state, bindings['Mod-b']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'strong')).toBe(true)
  })

  it('Mod-i applies em to selected text', () => {
    const state = stateWithSelection('hello')
    const next = applyCmd(state, bindings['Mod-i']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'em')).toBe(true)
  })

  it('Mod-Shift-x applies strikethrough to selected text', () => {
    const state = stateWithSelection('hello')
    const next = applyCmd(state, bindings['Mod-Shift-x']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'strikethrough')).toBe(true)
  })
})

describe('keymapBindings - heading shortcuts', () => {
  it('Mod-Alt-1 converts paragraph to heading level 1', () => {
    const state = stateWithText('hello')
    const next = applyCmd(state, bindings['Mod-Alt-1']!)
    expect(next).not.toBeNull()
    let hasHeading = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 1)
        hasHeading = true
    })
    expect(hasHeading).toBe(true)
  })

  it('Mod-Alt-3 converts paragraph to heading level 3', () => {
    const state = stateWithText('hello')
    const next = applyCmd(state, bindings['Mod-Alt-3']!)
    expect(next).not.toBeNull()
    let hasHeading = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 3)
        hasHeading = true
    })
    expect(hasHeading).toBe(true)
  })

  it('Mod-Alt-0 converts heading back to paragraph', () => {
    // Build a state with a heading
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 2 }, [schema.text('title')]),
    ])
    const state = EditorState.create({ schema, doc })
    const next = applyCmd(state, bindings['Mod-Alt-0']!)
    expect(next).not.toBeNull()
    expect(next!.doc.firstChild!.type.name).toBe('paragraph')
  })
})

describe('keymapBindings - list commands callable', () => {
  it('Enter is a function', () => {
    expect(typeof bindings['Enter']).toBe('function')
  })

  it('Tab is a function', () => {
    expect(typeof bindings['Tab']).toBe('function')
  })

  it('Shift-Tab is a function', () => {
    expect(typeof bindings['Shift-Tab']).toBe('function')
  })
})
