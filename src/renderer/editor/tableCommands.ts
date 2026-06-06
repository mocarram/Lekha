/**
 * tableCommands.ts
 *
 * The command layer behind the TableToolbar. Structural operations
 * (insert/delete rows & columns, delete table) delegate straight to
 * prosemirror-tables. Column alignment is bespoke: `setColumnAlign` writes the
 * `align` cell attr onto every cell of the column the cursor is in, which the
 * serializer then renders as GFM separator markers (`:--`/`:-:`/`--:`).
 */
import type { Command } from 'prosemirror-state'
import {
  addRowBefore,
  addRowAfter,
  deleteRow,
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  deleteTable,
  isInTable,
  selectedRect,
  type TableMap,
} from 'prosemirror-tables'

/** The full set of toolbar-driven table operations. */
export type TableCommand =
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'deleteTable'
  | 'alignLeft'
  | 'alignCenter'
  | 'alignRight'
  | 'alignNone'

/** Cell alignment values the toolbar can apply. `null` clears alignment. */
type Align = 'left' | 'center' | 'right' | null

/**
 * Set the `align` attribute on every cell in the column(s) currently spanned
 * by the selection.
 *
 * GFM tables align by COLUMN, not by individual cell, so to keep the document
 * consistent (and the serialized separator markers correct) we apply the value
 * to the whole column - header and body alike.
 *
 * How it works:
 *   1. `selectedRect(state)` gives the current table's geometry: its `map`
 *      (a TableMap), the absolute `tableStart`, and the selected cell
 *      rectangle (`left`/`right`/`top`/`bottom` in column/row coordinates).
 *   2. We walk every column in `[left, right)` and, for each, every row in
 *      `[0, map.height)`, asking the map for the cell start position. Each
 *      position is table-relative, so we add `tableStart` to get an absolute
 *      doc position, then `setNodeAttribute` the `align` attr on that cell.
 *   3. Cell positions can repeat when a cell spans multiple rows (rowspan); a
 *      `seen` set de-dupes so we never set the same node twice.
 */
function setColumnAlign(align: Align): Command {
  return (state, dispatch) => {
    if (!isInTable(state)) return false
    if (!dispatch) return true

    const rect = selectedRect(state)
    const map: TableMap = rect.map
    const { tableStart } = rect
    const tr = state.tr
    const seen = new Set<number>()

    for (let col = rect.left; col < rect.right; col++) {
      for (let row = 0; row < map.height; row++) {
        const cellPos = map.map[row * map.width + col]
        if (cellPos === undefined || seen.has(cellPos)) continue
        seen.add(cellPos)
        tr.setNodeAttribute(tableStart + cellPos, 'align', align)
      }
    }

    if (tr.docChanged) dispatch(tr)
    return true
  }
}

/**
 * Map every {@link TableCommand} to a ProseMirror `Command`. Structural ops are
 * the prosemirror-tables commands verbatim; the four `align*` entries are
 * `setColumnAlign` partials.
 */
export const tableCommandMap: Record<TableCommand, Command> = {
  addRowBefore,
  addRowAfter,
  deleteRow,
  addColumnBefore,
  addColumnAfter,
  deleteColumn,
  deleteTable,
  alignLeft: setColumnAlign('left'),
  alignCenter: setColumnAlign('center'),
  alignRight: setColumnAlign('right'),
  alignNone: setColumnAlign(null),
}
