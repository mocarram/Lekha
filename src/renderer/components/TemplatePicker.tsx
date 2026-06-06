/**
 * TemplatePicker - modal for choosing a document template.
 *
 * Follows the same token-themed, keyboard-first UX as CommandPalette:
 *   - Autofocused fuzzy-filter input
 *   - Arrow up/down moves selection (with wrapping)
 *   - Enter / click selects the highlighted template
 *   - Esc closes without selecting
 *   - Click on the backdrop closes
 *
 * The component is presentational. Selecting a template calls onSelect(template)
 * and the caller (App) is responsible for running the guardUnsaved - newFile -
 * setMarkdown flow.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { Template } from '@renderer/templates/registry'
import { fuzzyFilter } from '@renderer/commands/fuzzy'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TemplatePickerProps {
  open: boolean
  templates: Template[]
  onSelect: (template: Template) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Highlight helper (mirrors CommandPalette.highlight)
// ---------------------------------------------------------------------------

function highlight(text: string, indices: number[]): ReactNode {
  if (indices.length === 0) return text
  const set = new Set(indices)
  const parts: ReactNode[] = []
  let run = ''
  let runMatched = set.has(0)
  for (let i = 0; i < text.length; i++) {
    const matched = set.has(i)
    if (matched !== runMatched && run.length > 0) {
      parts.push(
        runMatched ? (
          <mark className="cmdk__match" key={i - run.length}>
            {run}
          </mark>
        ) : (
          <span key={i - run.length}>{run}</span>
        ),
      )
      run = ''
    }
    runMatched = matched
    run += text[i]
  }
  if (run.length > 0) {
    parts.push(
      runMatched ? (
        <mark className="cmdk__match" key={text.length - run.length}>
          {run}
        </mark>
      ) : (
        <span key={text.length - run.length}>{run}</span>
      ),
    )
  }
  return parts
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TemplatePicker({ open, templates, onSelect, onClose }: TemplatePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Remounts fresh via parent `key` prop on each open - no reset effect needed.
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  // Confine Tab/Shift+Tab to the picker while it is open.
  useFocusTrap(dialogRef, open)

  // Autofocus the input when the picker opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Filtered, ranked rows.
  const rows = useMemo(() => {
    return fuzzyFilter(query, templates, (t) => t.name).map((m) => ({
      key: m.item.id,
      label: m.item.name,
      description: m.item.description ?? '',
      indices: m.indices,
      template: m.item,
    }))
  }, [query, templates])

  // Clamp selection into the current list length.
  const active = rows.length === 0 ? 0 : Math.min(selected, rows.length - 1)

  // Scroll the active row into view on selection change.
  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (rows.length > 0) setSelected((active + 1) % rows.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rows.length > 0) setSelected((active - 1 + rows.length) % rows.length)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const row = rows[active]
      if (row) onSelect(row.template)
      return
    }
  }

  return (
    <div className="cmdk__backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="New from template"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmdk__input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="tmpl-list"
          aria-activedescendant={rows[active] ? `tmpl-row-${active}` : undefined}
          placeholder="Filter templates…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {rows.length === 0 ? (
          <div className="cmdk__empty">No matches.</div>
        ) : (
          <ul ref={listRef} id="tmpl-list" className="cmdk__list" role="listbox">
            {rows.map((row, i) => (
              <li
                key={row.key}
                id={`tmpl-row-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'cmdk__row cmdk__row--active' : 'cmdk__row'}
                onMouseEnter={() => setSelected(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelect(row.template)}
              >
                <span className="cmdk__label">{highlight(row.label, row.indices)}</span>
                {row.description ? (
                  <span className="cmdk__hint">{row.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
