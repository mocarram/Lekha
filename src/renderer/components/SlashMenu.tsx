/**
 * SlashMenu - the popup for the `/` block-insert menu (a feature WYSIWYG lacks).
 *
 * It is purely presentational. The slashMenu ProseMirror plugin owns the
 * `{ open, from, query }` activation state; EditorView lifts that into React
 * and renders this component anchored at the caret. This component:
 *   - fuzzy-filters SLASH_ITEMS by the `query` prop,
 *   - owns its own `selectedIndex` (reset whenever the query changes),
 *   - handles Arrow up/down (wrapping), Enter, and Escape via a WINDOW listener
 *     (the editor keeps DOM focus, and the plugin's handleKeyDown swallows those
 *     keys so only this component acts on them),
 *   - reports intent via onSelect(id) / onClose().
 *
 * Token-themed (light + dark) and accessible: role="listbox" with
 * aria-selected options.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { fuzzyFilter } from '@renderer/commands/fuzzy'
import { SLASH_ITEMS, type SlashItem } from '@renderer/editor/plugins/slashMenu'

/** Screen (client) coordinates of the caret, used to anchor the popup. */
export interface SlashCoords {
  left: number
  top: number
}

export interface SlashMenuProps {
  open: boolean
  /** The text typed after the slash; drives the fuzzy filter. */
  query: string
  /** Caret position in client coordinates. */
  coords: SlashCoords
  /** Fired with the chosen item id on Enter / click. */
  onSelect: (id: string) => void
  /** Fired on Escape. */
  onClose: () => void
}

/** Build the fuzzy search key for an item (label plus its keywords). */
const itemKey = (item: SlashItem): string => `${item.label} ${item.keywords.join(' ')}`

/**
 * Emphasise the fuzzy-matched characters of the label. `indices` are positions
 * into the search key (label + keywords); only those that fall inside the label
 * itself are highlighted, so keyword-only matches simply render the plain label.
 */
function highlightLabel(label: string, indices: number[]): ReactNode {
  const set = new Set(indices.filter((i) => i < label.length))
  if (set.size === 0) return label
  const parts: ReactNode[] = []
  let run = ''
  let runMatched = set.has(0)
  for (let i = 0; i < label.length; i++) {
    const matched = set.has(i)
    if (matched !== runMatched && run.length > 0) {
      parts.push(
        runMatched ? (
          <mark className="slashmenu__match" key={i - run.length}>{run}</mark>
        ) : (
          <span key={i - run.length}>{run}</span>
        ),
      )
      run = ''
    }
    runMatched = matched
    run += label[i]
  }
  if (run.length > 0) {
    parts.push(
      runMatched ? (
        <mark className="slashmenu__match" key={label.length - run.length}>{run}</mark>
      ) : (
        <span key={label.length - run.length}>{run}</span>
      ),
    )
  }
  return parts
}

export function SlashMenu({ open, query, coords, onSelect, onClose }: SlashMenuProps) {
  const [selected, setSelected] = useState(0)
  // Track the last-seen query so we can reset the highlight to the top during
  // render (React's "adjust state when a prop changes" pattern) - no effect,
  // so the list and selection update in a single pass.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setSelected(0)
  }

  // The filtered, ranked items for the current query.
  const rows = useMemo(
    () => fuzzyFilter(query, SLASH_ITEMS, itemKey),
    [query],
  )

  // Clamp the raw selection into the current list during render.
  const active = rows.length === 0 ? 0 : Math.min(selected, rows.length - 1)

  // Window-level keyboard handling while open. The editor still owns focus, so
  // we listen globally; the slashMenu plugin's handleKeyDown swallows these
  // same keys to prevent double-handling. Typing (filtering) and Backspace flow
  // to the editor normally and arrive back here via an updated `query` prop.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (rows.length > 0) setSelected((i) => (i + 1) % rows.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (rows.length > 0) setSelected((i) => (i - 1 + rows.length) % rows.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const row = rows[active]
        if (row) onSelect(row.item.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, rows, active, onSelect, onClose])

  if (!open) return null

  return (
    <div
      className="slashmenu"
      role="listbox"
      aria-label="Insert block"
      style={{ left: coords.left, top: coords.top }}
    >
      {rows.length === 0 ? (
        <div className="slashmenu__empty">No matches</div>
      ) : (
        rows.map((m, i) => (
          <button
            type="button"
            key={m.item.id}
            id={`slashmenu-row-${i}`}
            role="option"
            aria-selected={i === active}
            className={
              i === active ? 'slashmenu__row slashmenu__row--active' : 'slashmenu__row'
            }
            onMouseEnter={() => setSelected(i)}
            // Keep editor focus: prevent the mousedown from blurring it.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(m.item.id)}
          >
            <span className="slashmenu__icon" aria-hidden="true">{m.item.icon}</span>
            <span className="slashmenu__label">{highlightLabel(m.item.label, m.indices)}</span>
          </button>
        ))
      )}
    </div>
  )
}
