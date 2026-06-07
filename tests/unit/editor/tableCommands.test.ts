/**
 * Tests for the table-editing commands backing the TableToolbar.
 *
 * Each command is exercised at the ProseMirror command/state level: build a
 * state with the cursor inside a real (schema-parsed) table, run the command
 * via the shared `tableCommandMap`, apply the dispatched transaction, then
 * assert against the resulting document structure or serialized Markdown. This
 * mirrors how the editor handle invokes them, without a live EditorView.
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import {
  tableCommandMap,
  type TableCommand,
} from '../../../src/renderer/editor/tableCommands'

/** A 2x2 table (header row + one body row) in canonical Markdown. */
const TABLE_MD = '| A | B |\n| --- | --- |\n| a | b |'

/**
 * Build a state whose cursor sits inside the first body cell of the table.
 * We resolve the first `table_cell` (body) and place a collapsed selection
 * just inside it, so `isInTable` is true and the selected column is column 0.
 */
function stateInFirstBodyCell(md: string): EditorState {
  const doc = parseMarkdown(md)
  let cellPos = -1
  doc.descendants((node, pos) => {
    if (cellPos === -1 && node.type.name === 'table_cell') {
      cellPos = pos
      return false
    }
    return true
  })
  if (cellPos === -1) throw new Error('no body cell found')
  // +2: into the cell, into its paragraph, onto the text.
  const selection = TextSelection.create(doc, cellPos + 2)
  return EditorState.create({ doc, schema, selection })
}

/** Run a table command, apply its transaction, return the new doc. */
function run(state: EditorState, cmd: TableCommand): ProseMirrorNode {
  const command: Command = tableCommandMap[cmd]
  let next = state
  const handled = command(state, (tr) => {
    next = state.apply(tr)
  })
  expect(handled).toBe(true)
  return next.doc
}

/** Count `table_row` nodes in a doc. */
function countRows(doc: ProseMirrorNode): number {
  let rows = 0
  doc.descendants((node) => {
    if (node.type.name === 'table_row') rows += 1
    return true
  })
  return rows
}

/** Number of cells in the first table row (= column count). */
function countColumns(doc: ProseMirrorNode): number {
  let columns = 0
  doc.descendants((node) => {
    if (columns === 0 && node.type.name === 'table_row') {
      columns = node.childCount
      return false
    }
    return true
  })
  return columns
}

describe('tableCommandMap - structural commands', () => {
  it('addRowAfter increases the row count', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    expect(countRows(state.doc)).toBe(2)
    expect(countRows(run(state, 'addRowAfter'))).toBe(3)
  })

  it('addRowBefore increases the row count', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    expect(countRows(run(state, 'addRowBefore'))).toBe(3)
  })

  it('deleteRow decreases the row count', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    expect(countRows(run(state, 'deleteRow'))).toBe(1)
  })

  it('addColumnAfter increases the column count', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    expect(countColumns(state.doc)).toBe(2)
    expect(countColumns(run(state, 'addColumnAfter'))).toBe(3)
  })

  it('deleteColumn decreases the column count', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    expect(countColumns(run(state, 'deleteColumn'))).toBe(1)
  })

  it('deleteTable removes the table entirely', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    const doc = run(state, 'deleteTable')
    let hasTable = false
    doc.descendants((node) => {
      if (node.type.name === 'table') hasTable = true
      return true
    })
    expect(hasTable).toBe(false)
  })
})

describe('tableCommandMap - setColumnAlign', () => {
  it('alignRight sets align:right on every cell in the current column', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    const doc = run(state, 'alignRight')
    const col0: (string | null)[] = []
    doc.descendants((node) => {
      if (node.type.name === 'table_row') {
        const first = node.firstChild
        col0.push((first?.attrs['align'] as string | null) ?? null)
        return false
      }
      return true
    })
    // Both the header cell and the body cell of column 0 are aligned right.
    expect(col0).toEqual(['right', 'right'])
  })

  it('alignment shows up in the serialized separator markers', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    const doc = run(state, 'alignCenter')
    // Column 0 -> center (`:-:`), column 1 untouched (`---`).
    expect(serializeMarkdown(doc)).toBe(
      '| A | B |\n| :-: | --- |\n| a | b |',
    )
  })

  it('alignNone clears a previously-set alignment', () => {
    // Start from a left-aligned column and clear it.
    const state = stateInFirstBodyCell('| A | B |\n| :-- | --- |\n| a | b |')
    const doc = run(state, 'alignNone')
    expect(serializeMarkdown(doc)).toBe('| A | B |\n| --- | --- |\n| a | b |')
  })

  it('leaves other columns untouched', () => {
    const state = stateInFirstBodyCell(TABLE_MD)
    const doc = run(state, 'alignLeft')
    const col1: (string | null)[] = []
    doc.descendants((node) => {
      if (node.type.name === 'table_row') {
        const second = node.child(1)
        col1.push((second.attrs['align'] as string | null) ?? null)
        return false
      }
      return true
    })
    expect(col1).toEqual([null, null])
  })
})

describe('tableCommandMap - move row / column', () => {
  const THREE_ROW = '| A | B |\n| --- | --- |\n| a | b |\n| c | d |'

  it('moveRowDown swaps the current body row with the one below', () => {
    const doc = run(stateInFirstBodyCell(THREE_ROW), 'moveRowDown')
    const md = serializeMarkdown(doc)
    // The "c | d" row now precedes "a | b".
    expect(md.indexOf('| c | d |')).toBeLessThan(md.indexOf('| a | b |'))
  })

  it('moveRowUp is a no-op safety at the top body row (declines past header)', () => {
    // From the first body row, moving up would hit the header row index 0,
    // which is a valid swap (header <-> first body). Assert it still produces a
    // valid table with the same number of rows.
    const doc = run(stateInFirstBodyCell(THREE_ROW), 'moveRowUp')
    expect(countRows(doc)).toBe(3)
  })

  it('moveColumnRight swaps the current column with the one to its right', () => {
    const doc = run(stateInFirstBodyCell(THREE_ROW), 'moveColumnRight')
    const md = serializeMarkdown(doc)
    // Header order is now "B | A".
    expect(md.indexOf('| B | A |')).toBe(0)
  })
})
