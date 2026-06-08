/**
 * TableToolbar - a small floating toolbar shown while the cursor is inside a
 * table. Offers insert/delete rows & columns, column alignment, and delete
 * table. Purely presentational: App owns the visibility (`show`) and the
 * anchor `rect`, and routes each click through `onCommand`.
 *
 * Positioning: anchored just above the table's top-left, using the client rect
 * reported by the editor. `position: fixed` keeps it in viewport coordinates,
 * matching `getBoundingClientRect()`. The anchor is clamped to the window and
 * editor-pane bounds (and hidden when the table scrolls out of view).
 */
import { useLayoutEffect, useRef, useState } from 'react'
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

const MOVE_BUTTONS: ToolButton[] = [
  { cmd: 'moveRowUp', title: 'Move row up', label: '↑' },
  { cmd: 'moveRowDown', title: 'Move row down', label: '↓' },
  { cmd: 'moveColumnLeft', title: 'Move column left', label: '←' },
  { cmd: 'moveColumnRight', title: 'Move column right', label: '→' },
]

const TABLE_BUTTONS: ToolButton[] = [
  { cmd: 'deleteTable', title: 'Delete table', label: '✕' },
]

/** Vertical gap between the toolbar and the top of the table. */
const TOOLBAR_OFFSET = 40
/** Margin kept between the toolbar and the window edges. */
const EDGE_MARGIN = 8

export function TableToolbar({ show, rect, onCommand }: TableToolbarProps) {
  const ref = useRef<HTMLDivElement>(null)
  // The toolbar's own width is constant (fixed set of buttons), so measure it
  // once and cache it - re-reading offsetWidth on every scroll-driven reposition
  // forces a layout reflow each frame for no benefit.
  const widthRef = useRef(0)
  // Position + visibility, computed against the cached width and the editor
  // pane's visible bounds (so it never overflows the right edge and hides when
  // the table's top scrolls out of view rather than lingering pinned to the top).
  // Defaults to the raw anchor; useLayoutEffect refines it before paint, so there
  // is no flicker.
  const [pos, setPos] = useState({ top: rect.top - TOOLBAR_OFFSET, left: rect.left, visible: true })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Cache the width on first measure; reuse it thereafter (no per-frame reflow).
    if (widthRef.current === 0) widthRef.current = el.offsetWidth
    const width = widthRef.current
    const pane = document.querySelector('.editor-pane')
    const pr = pane?.getBoundingClientRect() ?? null

    // Anchor a fixed offset above the table - no clamping to the pane top, which
    // previously left the toolbar pinned and lingering after the table scrolled
    // away.
    const top = rect.top - TOOLBAR_OFFSET
    let visible = true
    if (pr) {
      // Hide when the anchor would rise above the editor's content top (the
      // table's top has scrolled out of view, so the toolbar would overlap the
      // chrome) or the table has scrolled below the pane bottom.
      if (top < pr.top + 4 || rect.top > pr.bottom - 8) visible = false
    }

    // Clamp horizontally so the (often wide) toolbar stays on screen.
    const maxLeft = window.innerWidth - width - EDGE_MARGIN
    const left = Math.min(Math.max(rect.left, EDGE_MARGIN), Math.max(EDGE_MARGIN, maxLeft))

    setPos({ top, left, visible })
  }, [rect.top, rect.left, rect.width, rect.height])

  if (!show) return null

  const groups = [ROW_BUTTONS, COLUMN_BUTTONS, MOVE_BUTTONS, ALIGN_BUTTONS, TABLE_BUTTONS]

  return (
    <div
      ref={ref}
      className="table-toolbar"
      role="toolbar"
      aria-label="Table editing"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        visibility: pos.visible ? 'visible' : 'hidden',
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
              // data-tooltip drives a fast CSS tooltip (the native `title`
              // attribute has a ~1s browser delay). aria-label keeps the
              // accessible name for screen readers.
              data-tooltip={btn.title}
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
