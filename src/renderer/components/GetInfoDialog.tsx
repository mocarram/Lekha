/**
 * GetInfoDialog - read-only modal showing metadata for the current document
 * (File ▸ Get Info). Purely presentational: App fetches the file stat (in the
 * command handler, not an effect) and passes the resolved values in, so this
 * component has no data-fetching effects.
 */
import { useRef, type KeyboardEvent } from 'react'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

export interface GetInfoData {
  path: string
  sizeBytes: number
  birthtimeMs: number
  mtimeMs: number
  words: number
  chars: number
}

export interface GetInfoDialogProps {
  open: boolean
  data: GetInfoData | null
  onClose: () => void
}

/** Human-readable byte size: B / KB / MB. */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Locale date+time from an epoch-ms timestamp. */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleString()
}

export function GetInfoDialog({ open, data, onClose }: GetInfoDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, open)

  if (!open || data === null) return null

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault()
      onClose()
    }
  }

  const rows: [string, string][] = [
    ['Name', data.path.split('/').pop() ?? data.path],
    ['Where', data.path],
    ['Size', formatSize(data.sizeBytes)],
    ['Created', formatDate(data.birthtimeMs)],
    ['Modified', formatDate(data.mtimeMs)],
    ['Words', String(data.words)],
    ['Characters', String(data.chars)],
  ]

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Get Info"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="prefs-title">Get Info</h2>
        <dl className="wc-panel__list">
          {rows.map(([label, value]) => (
            <div className="wc-panel__row" key={label}>
              <dt className="wc-panel__label">{label}</dt>
              <dd className="wc-panel__value get-info__value">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
