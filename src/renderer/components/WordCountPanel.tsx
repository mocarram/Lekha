/**
 * WordCountPanel - a small popover with detailed document statistics.
 *
 * Opened by clicking the word-count area in the StatusBar. It receives the
 * current document text/markdown (so it always reflects the live document) and
 * computes the stats with the pure `documentStats` helper on each open.
 *
 * Dismissal: outside click (the backdrop), Escape, or re-clicking the trigger
 * (handled by the parent toggling `open`). Token-themed via the shared dialog
 * tokens; accessible (role="dialog", aria-modal, focusable, labelled).
 */
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import { documentStats } from '@renderer/editor/wordCount'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

export interface WordCountPanelProps {
  open: boolean
  /** Current document text/markdown to compute stats from. */
  text: string
  onClose: () => void
}

/** A single labelled stat row. */
interface StatRow {
  label: string
  value: string
}

export function WordCountPanel({ open, text, onClose }: WordCountPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Confine Tab/Shift+Tab to the panel while it is open.
  useFocusTrap(panelRef, open)

  // Recompute the stats whenever the panel opens or the text changes.
  const rows = useMemo<StatRow[]>(() => {
    const stats = documentStats(text)
    const minutes = stats.readingTimeMinutes
    return [
      { label: 'Words', value: String(stats.words) },
      { label: 'Characters', value: String(stats.characters) },
      { label: 'Characters (no spaces)', value: String(stats.charactersNoSpaces) },
      { label: 'Lines', value: String(stats.lines) },
      { label: 'Paragraphs', value: String(stats.paragraphs) },
      {
        label: 'Reading time',
        value: `${minutes} min`,
      },
    ]
  }, [text])

  // Move focus into the panel for keyboard accessibility when it opens.
  useEffect(() => {
    if (open) panelRef.current?.focus()
  }, [open])

  if (!open) return null

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    // The transparent backdrop captures outside clicks. mouseDown (not click)
    // mirrors the dialog dismissal pattern used elsewhere (Preferences).
    <div className="wc-panel__backdrop" onMouseDown={onClose}>
      <div
        ref={panelRef}
        className="wc-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Document statistics"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="wc-panel__title">Document statistics</h2>
        <dl className="wc-panel__list">
          {rows.map((row) => (
            <div className="wc-panel__row" key={row.label}>
              <dt className="wc-panel__label">{row.label}</dt>
              <dd className="wc-panel__value">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
