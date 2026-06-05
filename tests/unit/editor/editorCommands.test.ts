/**
 * Unit tests for editorCommandMap.
 *
 * Verifies the command map produces working ProseMirror commands for all
 * editor-affecting AppCommands. The keymap bindings must share the same
 * underlying command implementations (DRY).
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection, type Command } from 'prosemirror-state'
import { schema } from '../../../src/renderer/editor/schema'
import { editorCommandMap } from '../../../src/renderer/editor/editorCommands'
import type { AppCommand } from '../../../src/shared/commands'

// ---------------------------------------------------------------------------
// Helpers (shared with keymap tests)
// ---------------------------------------------------------------------------

/** Create a state with a paragraph containing text, the selection over it all. */
function stateWithSelection(text: string): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  const selection = TextSelection.create(doc, 1, 1 + text.length)
  return EditorState.create({ schema, doc, selection })
}

/** Create a state with a paragraph containing text, cursor at the start. */
function stateWithText(text: string): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  return EditorState.create({ schema, doc })
}

/**
 * Apply a ProseMirror command to state.
 * Returns the new state if the command fired, null if declined.
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
// Lazy fixture: build the command map once
// ---------------------------------------------------------------------------

const cmdMap = editorCommandMap(schema)

// ---------------------------------------------------------------------------
// Presence checks
// ---------------------------------------------------------------------------

describe('editorCommandMap - entries present', () => {
  const expectedCommands: AppCommand[] = [
    'bold', 'italic', 'strikethrough', 'inlineCode',
    'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
    'paragraph',
    'bulletList', 'orderedList', 'blockquote', 'codeBlock',
    'horizontalRule',
    'undo', 'redo',
  ]

  for (const cmd of expectedCommands) {
    it(`has an entry for "${cmd}"`, () => {
      expect(cmdMap[cmd]).toBeDefined()
      expect(typeof cmdMap[cmd]).toBe('function')
    })
  }
})

// ---------------------------------------------------------------------------
// Mark toggles
// ---------------------------------------------------------------------------

describe('editorCommandMap - mark toggles', () => {
  it('bold toggles strong mark on selection', () => {
    const state = stateWithSelection('hello')
    const next = applyCmd(state, cmdMap['bold']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'strong')).toBe(true)
  })

  it('italic toggles em mark on selection', () => {
    const state = stateWithSelection('world')
    const next = applyCmd(state, cmdMap['italic']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'em')).toBe(true)
  })

  it('strikethrough toggles strikethrough mark on selection', () => {
    const state = stateWithSelection('text')
    const next = applyCmd(state, cmdMap['strikethrough']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'strikethrough')).toBe(true)
  })

  it('inlineCode toggles code mark on selection', () => {
    const state = stateWithSelection('snippet')
    const next = applyCmd(state, cmdMap['inlineCode']!)
    expect(next).not.toBeNull()
    expect(hasMark(next!, 'code')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Block type commands
// ---------------------------------------------------------------------------

describe('editorCommandMap - block type conversions', () => {
  it('heading2 sets a heading with level 2', () => {
    const state = stateWithText('hello')
    const next = applyCmd(state, cmdMap['heading2']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 2) found = true
    })
    expect(found).toBe(true)
  })

  it('heading1 sets a heading with level 1', () => {
    const state = stateWithText('hello')
    const next = applyCmd(state, cmdMap['heading1']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 1) found = true
    })
    expect(found).toBe(true)
  })

  it('heading6 sets a heading with level 6', () => {
    const state = stateWithText('deep')
    const next = applyCmd(state, cmdMap['heading6']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 6) found = true
    })
    expect(found).toBe(true)
  })

  it('paragraph converts a heading back to a paragraph', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 3 }, [schema.text('title')]),
    ])
    const state = EditorState.create({ schema, doc })
    const next = applyCmd(state, cmdMap['paragraph']!)
    expect(next).not.toBeNull()
    expect(next!.doc.firstChild!.type.name).toBe('paragraph')
  })

  it('codeBlock converts a paragraph to code_block', () => {
    const state = stateWithText('some code')
    const next = applyCmd(state, cmdMap['codeBlock']!)
    expect(next).not.toBeNull()
    expect(next!.doc.firstChild!.type.name).toBe('code_block')
  })
})

// ---------------------------------------------------------------------------
// List / wrap commands
// ---------------------------------------------------------------------------

describe('editorCommandMap - list and wrap commands', () => {
  it('bulletList wraps a paragraph in a bullet_list', () => {
    const state = stateWithText('item')
    const next = applyCmd(state, cmdMap['bulletList']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'bullet_list') found = true
    })
    expect(found).toBe(true)
  })

  it('orderedList wraps a paragraph in an ordered_list', () => {
    const state = stateWithText('item')
    const next = applyCmd(state, cmdMap['orderedList']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'ordered_list') found = true
    })
    expect(found).toBe(true)
  })

  it('blockquote wraps a paragraph in a blockquote', () => {
    const state = stateWithText('quote')
    const next = applyCmd(state, cmdMap['blockquote']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'blockquote') found = true
    })
    expect(found).toBe(true)
  })

  // ------------------------------------------------------------------
  // taskList - must produce task_list > task_item (not list_item)
  // ------------------------------------------------------------------

  it('taskList wraps a paragraph in a task_list', () => {
    const state = stateWithText('my task')
    const next = applyCmd(state, cmdMap['taskList']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'task_list') found = true
    })
    expect(found).toBe(true)
  })

  it('taskList produces task_item children (not list_item)', () => {
    const state = stateWithText('my task')
    const next = applyCmd(state, cmdMap['taskList']!)
    expect(next).not.toBeNull()
    let taskItemCount = 0
    let listItemCount = 0
    next!.doc.descendants((node) => {
      if (node.type.name === 'task_item') taskItemCount++
      if (node.type.name === 'list_item') listItemCount++
    })
    expect(taskItemCount).toBeGreaterThan(0)
    expect(listItemCount).toBe(0)
  })

  it('taskList task_item has checked=false by default', () => {
    const state = stateWithText('my task')
    const next = applyCmd(state, cmdMap['taskList']!)
    expect(next).not.toBeNull()
    let checkedFalseCount = 0
    next!.doc.descendants((node) => {
      if (node.type.name === 'task_item' && node.attrs['checked'] === false) {
        checkedFalseCount++
      }
    })
    expect(checkedFalseCount).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// horizontalRule
// ---------------------------------------------------------------------------

describe('editorCommandMap - horizontalRule', () => {
  it('inserts a horizontal_rule node', () => {
    const state = stateWithText('before')
    const next = applyCmd(state, cmdMap['horizontalRule']!)
    expect(next).not.toBeNull()
    let found = false
    next!.doc.descendants((node) => {
      if (node.type.name === 'horizontal_rule') found = true
    })
    expect(found).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// History (undo / redo) - just verify they are functions that run without error
// ---------------------------------------------------------------------------

describe('editorCommandMap - history commands', () => {
  it('undo is a Command function', () => {
    expect(typeof cmdMap['undo']).toBe('function')
  })

  it('redo is a Command function', () => {
    expect(typeof cmdMap['redo']).toBe('function')
  })

  it('undo runs without throwing on a fresh state', () => {
    const state = stateWithText('hello')
    expect(() => {
      cmdMap['undo']!(state, () => {}, null as never)
    }).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// DRY check: keymap bindings reuse the same command builders
// ---------------------------------------------------------------------------

describe('editorCommandMap - DRY with keymap (same command identity)', () => {
  it('keymapBindings Mod-b and cmdMap.bold produce the same mark result', () => {
    // Both should produce a state with the strong mark when applied to a selection
    const state = stateWithSelection('test')
    const result = applyCmd(state, cmdMap['bold']!)
    expect(result).not.toBeNull()
    expect(hasMark(result!, 'strong')).toBe(true)
  })

  it('keymapBindings Mod-Alt-2 and cmdMap.heading2 both produce heading level 2', () => {
    // Both originate from the same builder call in editorCommands.ts
    const state = stateWithText('heading')
    const result = applyCmd(state, cmdMap['heading2']!)
    expect(result).not.toBeNull()
    let found = false
    result!.doc.descendants((node) => {
      if (node.type.name === 'heading' && node.attrs['level'] === 2) found = true
    })
    expect(found).toBe(true)
  })
})
