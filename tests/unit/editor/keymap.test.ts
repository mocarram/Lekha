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

// ---------------------------------------------------------------------------
// Table-aware Tab / Shift-Tab (goToNextCell chain)
// ---------------------------------------------------------------------------

describe('keymapBindings - table cell navigation', () => {
  /**
   * Build a minimal table doc: one table_row with two table_cell nodes,
   * each containing a paragraph. Cursor starts in the first cell.
   */
  function tableState(): EditorState {
    const cellContent = schema.node('paragraph', null, [schema.text('a')])
    const cell1 = schema.node('table_cell', null, [cellContent])
    const cell2 = schema.node('table_cell', null, [
      schema.node('paragraph', null, [schema.text('b')]),
    ])
    const row = schema.node('table_row', null, [cell1, cell2])
    const table = schema.node('table', null, [row])
    const doc = schema.node('doc', null, [table])
    return EditorState.create({ schema, doc })
  }

  it('Tab command does not throw when called on a table state', () => {
    const state = tableState()
    expect(() => {
      bindings['Tab']!(state, () => {}, null as never)
    }).not.toThrow()
  })

  it('Shift-Tab command does not throw when called on a table state', () => {
    const state = tableState()
    expect(() => {
      bindings['Shift-Tab']!(state, () => {}, null as never)
    }).not.toThrow()
  })

  it('Tab sinks a list item under its preceding sibling in a plain list', () => {
    // Build: bullet_list > [ list_item("a"), list_item("b") ]
    // Cursor inside item "b". sinkListItem requires a preceding sibling, so it
    // will nest "b" under "a", producing:
    //   bullet_list > list_item("a", bullet_list > list_item("b"))
    const itemA = schema.node('list_item', null, [
      schema.node('paragraph', null, [schema.text('a')]),
    ])
    const itemB = schema.node('list_item', null, [
      schema.node('paragraph', null, [schema.text('b')]),
    ])
    const list = schema.node('bullet_list', null, [itemA, itemB])
    const doc = schema.node('doc', null, [list])

    // Position map (each node contributes 2 tokens + children):
    //   pos 0: before bullet_list | 1: in bullet_list
    //   pos 2: in list_item_a | 3: in para_a | 4: text "a" | 5: after para_a
    //   pos 6: after list_item_a | 7: in list_item_b | 8: in para_b
    //   pos 9: text "b"
    const sel = TextSelection.create(doc, 8) // inside para_b of item "b"
    const state = EditorState.create({ schema, doc, selection: sel })

    let nextState: EditorState | null = null
    const dispatched = bindings['Tab']!(state, (tr) => {
      nextState = state.apply(tr)
    })

    // The command must have fired and the transaction dispatched
    expect(dispatched).toBe(true)
    expect(nextState).not.toBeNull()

    // The top-level bullet_list should now have exactly ONE child (item "a")
    const topList = nextState!.doc.firstChild! // bullet_list
    expect(topList.childCount).toBe(1)

    // That child (item "a") must contain a nested bullet_list
    const outerItem = topList.child(0) // list_item("a", bullet_list(...))
    expect(outerItem.childCount).toBe(2) // paragraph + nested bullet_list
    expect(outerItem.child(1).type.name).toBe('bullet_list')

    // The nested bullet_list must contain item "b"
    const nestedList = outerItem.child(1)
    expect(nestedList.childCount).toBe(1)
    expect(nestedList.child(0).child(0).textContent).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// Editor shortcut additions: Cmd+1..6 / Cmd+0 headings, Shift-Enter, Backspace
// ---------------------------------------------------------------------------

describe('keymapBindings - heading shortcuts (Mod-1..6 / Mod-0)', () => {
  it('exports Mod-1 through Mod-6 and Mod-0', () => {
    for (let i = 1; i <= 6; i++) {
      expect(bindings[`Mod-${i}`], `Mod-${i} missing`).toBeDefined()
    }
    expect(bindings['Mod-0']).toBeDefined()
  })

  it('Mod-2 converts a paragraph to heading level 2', () => {
    const next = applyCmd(stateWithText('hello'), bindings['Mod-2']!)
    expect(next).not.toBeNull()
    expect(next!.doc.firstChild!.type.name).toBe('heading')
    expect(next!.doc.firstChild!.attrs['level']).toBe(2)
  })

  it('Mod-0 converts a heading back to a paragraph', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 2 }, [schema.text('title')]),
    ])
    const next = applyCmd(EditorState.create({ schema, doc }), bindings['Mod-0']!)
    expect(next).not.toBeNull()
    expect(next!.doc.firstChild!.type.name).toBe('paragraph')
  })
})

describe('keymapBindings - Shift-Enter hard break', () => {
  it('inserts a hard_break node', () => {
    const next = applyCmd(stateWithText('line'), bindings['Shift-Enter']!)
    expect(next).not.toBeNull()
    let hasBreak = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'hard_break') hasBreak = true
    })
    expect(hasBreak).toBe(true)
  })
})

describe('keymapBindings - Backspace undoes input rules', () => {
  it('exports a Backspace binding', () => {
    expect(bindings['Backspace']).toBeDefined()
    expect(typeof bindings['Backspace']).toBe('function')
  })

  it('declines (returns false) when there is no input rule to undo', () => {
    // No undoable input rule in plain state -> command should decline so the
    // base keymap can handle a normal delete.
    const fired = bindings['Backspace']!(stateWithText('hello'), undefined)
    expect(fired).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tab in the last table cell appends a row
// ---------------------------------------------------------------------------

describe('keymapBindings - Tab appends a table row at the end', () => {
  function oneRowTable(): EditorState {
    const cell = (t: string) =>
      schema.node('table_cell', null, [
        schema.node('paragraph', null, [schema.text(t)]),
      ])
    const row = schema.node('table_row', null, [cell('a'), cell('b')])
    const table = schema.node('table', null, [row])
    const doc = schema.node('doc', null, [table])
    return EditorState.create({ schema, doc })
  }

  function rowCount(state: EditorState): number {
    let n = 0
    state.doc.descendants((node) => {
      if (node.type.name === 'table_row') n++
    })
    return n
  }

  it('adds a second row when Tab is pressed in the last cell', () => {
    let state = oneRowTable()
    expect(rowCount(state)).toBe(1)
    // Tab: first cell -> second (last) cell
    state = applyCmd(state, bindings['Tab']!)!
    expect(state).not.toBeNull()
    expect(rowCount(state)).toBe(1)
    // Tab again from the last cell -> appends a row
    state = applyCmd(state, bindings['Tab']!)!
    expect(state).not.toBeNull()
    expect(rowCount(state)).toBe(2)
  })
})
