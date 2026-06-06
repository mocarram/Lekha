/**
 * TableToolbar - a small floating toolbar shown while the cursor is inside a
 * table. Offers insert/delete rows & columns, column alignment, and delete
 * table. Purely presentational: App owns the visibility (`show`) and the
 * anchor `rect`, and routes each click through `onCommand`.
 *
 * Positioning: anchored just above the table's top-left, using the client rect
 * reported by the editor. `position: fixed` keeps it in viewport coordinates,
 * matching `getBoundingClientRect()`.
 */
import type { TableCommand, TableState } from '@renderer/editor/EditorPane'

type TableRect = NonNullable<TableState['rect']>

export interface TableToolbarProps {
  /** Whether the toolbar is visible (cursor is in a table). */
  show: boolean
  /** Anchor rect of the active table, in viewport coordinates. */
  rect: TableRect
  /** Run a table command and re-focus the editor. */
  onCommand: (cmd: TableCommand) => void
}

/** One button: a TableCommand, its tooltip, and its glyph. */
interface ToolButton {
  cmd: TableCommand
  title: string
  label: string
}

// Grouped so we can render separators between logical sets. Glyphs are plain
// unicode so no icon dependency is needed and they theme with the text color.
const ROW_BUTTONS: ToolButton[] = [
  { cmd: 'addRowBefore', title: 'Insert row above', label: '⤒' },
  { cmd: 'addRowAfter', title: 'Insert row below', label: '⤓' },
  { cmd: 'deleteRow', title: 'Delete row', label: '⊟' },
]

const COLUMN_BUTTONS: ToolButton[] = [
  { cmd: 'addColumnBefore', title: 'Insert column left', label: '⇤' },
  { cmd: 'addColumnAfter', title: 'Insert column right', label: '⇥' },
  { cmd: 'deleteColumn', title: 'Delete column', label: '⊠' },
]

const ALIGN_BUTTONS: ToolButton[] = [
  { cmd: 'alignLeft', title: 'Align left', label: '⇤' },
  { cmd: 'alignCenter', title: 'Align center', label: '↔' },
  { cmd: 'alignRight', title: 'Align right', label: '⇥' },
]

const TABLE_BUTTONS: ToolButton[] = [
  { cmd: 'deleteTable', title: 'Delete table', label: '✕' },
]

/** Vertical gap between the toolbar and the top of the table. */
const TOOLBAR_OFFSET = 40

export function TableToolbar({ show, rect, onCommand }: TableToolbarProps) {
  if (!show) return null

  const groups = [ROW_BUTTONS, COLUMN_BUTTONS, ALIGN_BUTTONS, TABLE_BUTTONS]

  return (
    <div
      className="table-toolbar"
      role="toolbar"
      aria-label="Table editing"
      style={{
        position: 'fixed',
        top: Math.max(rect.top - TOOLBAR_OFFSET, 4),
        left: rect.left,
      }}
      // Keep editor focus/selection when pressing a button: prevent the
      // mousedown from moving the caret out of the table before the command
      // runs against the current selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      {groups.map((group, gi) => (
        <div className="table-toolbar-group" key={gi}>
          {group.map((btn) => (
            <button
              key={btn.cmd}
              type="button"
              className="table-toolbar-btn"
              title={btn.title}
              aria-label={btn.title}
              onClick={() => onCommand(btn.cmd)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
