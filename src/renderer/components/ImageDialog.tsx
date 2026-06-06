/**
 * ImageDialog - modal for inserting a Markdown image.
 *
 * Controlled by props (App owns `{ open, initial }`). Keeps small local form
 * state for the editable fields, re-seeded from `initial` on open.
 *
 * Keyboard: Esc cancels, Enter confirms. The Image URL input is autofocused.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageDialogInitial {
  src: string
  alt: string
  title?: string
}

export interface ImageSubmit {
  src: string
  alt: string
  title?: string
}

export interface ImageDialogProps {
  open: boolean
  initial: ImageDialogInitial
  onSubmit: (value: ImageSubmit) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageDialog({ open, initial, onSubmit, onClose }: ImageDialogProps) {
  // Seeded from `initial` at mount; App remounts via a changing `key` on each
  // open so the prefill is always correct without a reseed effect.
  const [src, setSrc] = useState(initial.src)
  const [alt, setAlt] = useState(initial.alt)

  const srcInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Confine Tab/Shift+Tab to the dialog while it is open.
  useFocusTrap(dialogRef, open)

  useEffect(() => {
    if (!open) return
    srcInputRef.current?.focus()
    srcInputRef.current?.select()
  }, [open])

  if (!open) return null

  const confirm = (): void => {
    onSubmit({ src, alt })
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
        aria-label="Insert image"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-field">
          <label className="dialog-label" htmlFor="image-src">
            Image URL
          </label>
          <input
            id="image-src"
            ref={srcInputRef}
            type="text"
            className="dialog-input"
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            placeholder="https:// or assets/…"
            aria-label="Image URL"
          />
        </div>

        <div className="dialog-field">
          <label className="dialog-label" htmlFor="image-alt">
            Alt text
          </label>
          <input
            id="image-alt"
            type="text"
            className="dialog-input"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="describe the image"
            aria-label="Alt text"
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
            Insert
          </button>
        </div>
      </div>
    </div>
  )
}
