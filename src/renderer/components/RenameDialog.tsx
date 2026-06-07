/**
 * RenameDialog - modal for renaming the current document.
 *
 * Electron disables window.prompt, so renaming the open file needs a real modal.
 * App owns the `{ open, initial }` state and gives the dialog a fresh `key` on
 * each open so the field re-seeds with the current basename. Esc cancels, Enter
 * confirms; the input autofocuses with the base name (before the extension)
 * selected so typing replaces the name but keeps the extension.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

export interface RenameDialogProps {
  open: boolean
  /** Current file name (basename, e.g. "notes.md") to prefill. */
  initial: string
  onSubmit: (newName: string) => void
  onClose: () => void
}

export function RenameDialog({ open, initial, onSubmit, onClose }: RenameDialogProps) {
  const [name, setName] = useState(initial)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useFocusTrap(dialogRef, open)

  // Autofocus and select the base name (before the last dot) so the extension
  // is easy to keep.
  useEffect(() => {
    if (!open) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [open, initial])

  if (!open) return null

  const confirm = (): void => {
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed === initial) {
      onClose()
      return
    }
    onSubmit(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      confirm()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Rename file"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-field">
          <label className="dialog-label" htmlFor="rename-name">
            New name
          </label>
          <input
            id="rename-name"
            ref={inputRef}
            type="text"
            className="dialog-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="New name"
          />
        </div>

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button type="button" className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={confirm}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  )
}
