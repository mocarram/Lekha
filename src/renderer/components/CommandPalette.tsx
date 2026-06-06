/**
 * CommandPalette - a centered modal (anchored in the upper third) that drives
 * two power-user features WYSIWYG lacks:
 *
 *   mode='commands' (Cmd+Shift+P): fuzzy-search every user command and run it.
 *   mode='files'    (Cmd+P):       fuzzy-search workspace Markdown files and open one.
 *
 * Both modes share one keyboard-first UX: an autofocused filter input, Arrow
 * up/down to move the selection (wrapping at the ends), Enter to activate the
 * selection, Esc to close, click to activate, and hover to highlight. The
 * fuzzy-matched characters are emphasised in each label.
 *
 * The component is presentational: selecting a command calls `onRun(id)` (App
 * forwards it to useCommands' shared dispatch) and selecting a file calls
 * `onOpenFile(path)`. It never routes commands itself, keeping a single
 * command-routing path.
 *
 * Token-themed (light + dark) and accessible: role="dialog", aria-modal, the
 * input owns the listbox via aria-controls / aria-activedescendant.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import type { AppCommand } from '@shared/commands'
import type { CommandDef } from '@renderer/commands/registry'
import { fuzzyFilter } from '@renderer/commands/fuzzy'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

/** A workspace file flattened from the file tree for quick-open. */
export interface PaletteFileEntry {
  /** Absolute path passed to onOpenFile. */
  path: string
  /** Basename shown as the primary label. */
  name: string
  /** Relative directory shown as the secondary hint ('' for the root). */
  dir: string
}

export type PaletteMode = 'commands' | 'files'

export interface CommandPaletteProps {
  open: boolean
  mode: PaletteMode
  /** All runnable commands (registry, minus palette entry-points). */
  commands: CommandDef[]
  /** All workspace Markdown files (flattened tree). */
  files: PaletteFileEntry[]
  /** Whether a workspace folder is open (drives the files empty state). */
  hasFolder: boolean
  /** Run a command (App forwards to the shared useCommands dispatch). */
  onRun: (id: AppCommand) => void
  /** Open a file by absolute path. */
  onOpenFile: (path: string) => void
  onClose: () => void
}

/**
 * Render a label with the fuzzy-matched character indices emphasised.
 * Splitting on the matched positions keeps the highlight purely visual.
 */
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

export function CommandPalette({
  open,
  mode,
  commands,
  files,
  hasFolder,
  onRun,
  onOpenFile,
  onClose,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // The palette starts fresh each time it opens: the parent passes a `key` that
  // changes per open (and per mode), so this component remounts and these
  // initializers run again - no reset effect needed.
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  // Confine Tab/Shift+Tab to the palette while it is open.
  useFocusTrap(dialogRef, open)

  // Autofocus the filter input when the palette opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // The filtered, ranked rows for the active mode. Each row carries the value
  // to activate (command id or file path), the visible label, an optional
  // hint, and the fuzzy indices into the label for highlighting.
  const rows = useMemo(() => {
    if (mode === 'commands') {
      return fuzzyFilter(query, commands, (c) => c.label).map((m) => ({
        key: m.item.id,
        label: m.item.label,
        hint: m.item.shortcut ?? '',
        indices: m.indices,
        activate: () => onRun(m.item.id),
      }))
    }
    return fuzzyFilter(query, files, (f) => f.name).map((m) => ({
      key: m.item.path,
      label: m.item.name,
      hint: m.item.dir,
      indices: m.indices,
      activate: () => onOpenFile(m.item.path),
    }))
  }, [mode, query, commands, files, onRun, onOpenFile])

  // Clamp the raw selection into the current list during render (the list
  // shrinks as the user types). Deriving rather than syncing via setState keeps
  // selection valid without an extra effect/render.
  const active = rows.length === 0 ? 0 : Math.min(selected, rows.length - 1)

  // Scroll the active row into view as the selection moves with the keyboard.
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
      rows[active]?.activate()
      return
    }
  }

  const placeholder =
    mode === 'commands' ? 'Run a command…' : 'Search files by name…'
  const emptyText =
    mode === 'files' && !hasFolder
      ? 'No folder open. Open a folder to search files.'
      : 'No matches.'

  return (
    <div className="cmdk__backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'commands' ? 'Command palette' : 'Quick open'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="cmdk__input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="cmdk-list"
          aria-activedescendant={
            rows[active] ? `cmdk-row-${active}` : undefined
          }
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {rows.length === 0 ? (
          <div className="cmdk__empty">{emptyText}</div>
        ) : (
          <ul ref={listRef} id="cmdk-list" className="cmdk__list" role="listbox">
            {rows.map((row, i) => (
              <li
                key={row.key}
                id={`cmdk-row-${i}`}
                role="option"
                aria-selected={i === active}
                className={
                  i === active ? 'cmdk__row cmdk__row--active' : 'cmdk__row'
                }
                onMouseEnter={() => setSelected(i)}
                // The enclosing .cmdk wrapper stops mousedown from reaching the
                // backdrop, so a plain click never tears the palette down early.
                // preventDefault on mousedown keeps focus on the input.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => row.activate()}
              >
                <span className="cmdk__label">
                  {highlight(row.label, row.indices)}
                </span>
                {row.hint ? <span className="cmdk__hint">{row.hint}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
