/**
 * FindReplace overlay component.
 *
 * Renders a floating panel (top-right) for find and optional replace
 * operations against the active WYSIWYG editor. Wires to EditorPaneHandle
 * find/replace methods via the passed editorRef.
 *
 * When `open` is false this component renders nothing.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type RefObject,
  type KeyboardEvent,
} from 'react'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FindReplaceProps {
  open: boolean
  mode: 'find' | 'replace'
  editorRef: RefObject<EditorPaneHandle | null>
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FindReplace({ open, mode, editorRef, onClose }: FindReplaceProps) {
  const [query, setQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchInfo, setMatchInfo] = useState({ current: 0, count: 0 })

  const findInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Confine Tab/Shift+Tab to the overlay while it is open.
  useFocusTrap(overlayRef, open)

  // On open: seed the query from the editor's current selection (WYSIWYG
  // behavior), then autofocus + select the input so the user can type over it.
  // Only seed short, single-line selections so a large/multi-line selection
  // doesn't become an unwieldy query.
  useEffect(() => {
    if (!open) return
    const selected = editorRef.current?.getSelectionText() ?? ''
    if (selected && selected.length <= 200 && !selected.includes('\n')) {
      setQuery(selected)
    }
    findInputRef.current?.focus()
    findInputRef.current?.select()
  }, [open, editorRef])

  // Call setFind whenever query or caseSensitive changes (while open).
  useEffect(() => {
    if (!open) return
    const editor = editorRef.current
    if (!editor) return
    const count = editor.setFind(query, { caseSensitive })
    const info = editor.getMatchInfo()
    setMatchInfo({ current: info.current, count })
  }, [open, query, caseSensitive, editorRef])

  const refreshMatchInfo = useCallback(() => {
    const info = editorRef.current?.getMatchInfo() ?? { current: 0, count: 0 }
    setMatchInfo(info)
  }, [editorRef])

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
    },
    [],
  )

  const handleFindNext = useCallback(() => {
    editorRef.current?.findNext()
    refreshMatchInfo()
  }, [editorRef, refreshMatchInfo])

  const handleFindPrev = useCallback(() => {
    editorRef.current?.findPrev()
    refreshMatchInfo()
  }, [editorRef, refreshMatchInfo])

  const handleReplaceCurrent = useCallback(() => {
    // replaceCurrent already advances to the next match internally.
    // Do NOT call findNext() here - that would skip a match.
    editorRef.current?.replaceCurrent(replaceValue)
    refreshMatchInfo()
  }, [editorRef, replaceValue, refreshMatchInfo])

  const handleReplaceAll = useCallback(() => {
    editorRef.current?.replaceAll(query, replaceValue, { caseSensitive })
    // After replacing all, re-run find to show "0 of 0" or new matches if any.
    const count = editorRef.current?.setFind(query, { caseSensitive }) ?? 0
    const info = editorRef.current?.getMatchInfo() ?? { current: 0, count }
    setMatchInfo(info)
  }, [editorRef, query, replaceValue, caseSensitive])

  const handleClose = useCallback(() => {
    editorRef.current?.clearFind()
    onClose()
  }, [editorRef, onClose])

  const handleFindKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (e.shiftKey) {
          handleFindPrev()
        } else {
          handleFindNext()
        }
      }
    },
    [handleClose, handleFindNext, handleFindPrev],
  )

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="find-replace-overlay"
      role="search"
      aria-label="Find and Replace"
    >
      <div className="find-replace-row">
        <input
          ref={findInputRef}
          type="text"
          className="find-replace-input"
          placeholder="Find"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleFindKeyDown}
          aria-label="Find"
        />

        <button
          type="button"
          className={`find-replace-btn-toggle${caseSensitive ? ' active' : ''}`}
          onClick={() => setCaseSensitive((prev) => !prev)}
          title="Case sensitive"
          aria-label="Case sensitive"
          aria-pressed={caseSensitive}
        >
          Aa
        </button>

        <button
          type="button"
          className="find-replace-btn"
          onClick={handleFindPrev}
          title="Previous match (Shift+Enter)"
          aria-label="Previous match"
        >
          &uarr;
        </button>

        <button
          type="button"
          className="find-replace-btn"
          onClick={handleFindNext}
          title="Next match (Enter)"
          aria-label="Next match"
        >
          &darr;
        </button>

        <span className="find-replace-count" aria-live="polite">
          {matchInfo.count === 0
            ? 'No matches'
            : `${matchInfo.current} / ${matchInfo.count}`}
        </span>

        <button
          type="button"
          className="find-replace-close"
          onClick={handleClose}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      {mode === 'replace' && (
        <div className="find-replace-row">
          <input
            type="text"
            className="find-replace-input"
            placeholder="Replace with"
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
            aria-label="Replace with"
          />

          <button
            type="button"
            className="find-replace-btn"
            onClick={handleReplaceCurrent}
            aria-label="Replace current"
          >
            Replace
          </button>

          <button
            type="button"
            className="find-replace-btn"
            onClick={handleReplaceAll}
            aria-label="Replace All"
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  )
}
