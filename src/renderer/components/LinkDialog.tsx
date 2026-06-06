/**
 * LinkDialog - modal for inserting or editing a Markdown link.
 *
 * Purely controlled by props: App owns the `{ open, mode, initial }` state and
 * the callbacks. The dialog keeps a small amount of local form state for the
 * editable fields, re-seeded from `initial` whenever it (re)opens.
 *
 * Modes:
 *   - 'insert': primary button reads "Insert"; no Remove/Open buttons.
 *   - 'edit':   primary button reads "Update"; Remove link + Open shown.
 *
 * Keyboard: Esc cancels, Enter confirms. The URL input is autofocused.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkDialogMode = 'insert' | 'edit'

export interface LinkDialogInitial {
  text: string
  href: string
  title?: string
}

export interface LinkSubmit {
  text: string
  href: string
  title?: string
}

export interface LinkDialogProps {
  open: boolean
  mode: LinkDialogMode
  initial: LinkDialogInitial
  onSubmit: (value: LinkSubmit) => void
  onRemove: () => void
  onOpenUrl: (url: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LinkDialog({
  open,
  mode,
  initial,
  onSubmit,
  onRemove,
  onOpenUrl,
  onClose,
}: LinkDialogProps) {
  // The form is seeded from `initial` at mount. App gives the dialog a fresh
  // `key` each time it opens (see App.tsx), so each open remounts with the
  // correct prefill - no reseed effect (and its cascading-render lint) needed.
  const [text, setText] = useState(initial.text)
  const [href, setHref] = useState(initial.href)
  const [title, setTitle] = useState(initial.title ?? '')

  const urlInputRef = useRef<HTMLInputElement>(null)

  // Autofocus the URL field when opened.
  useEffect(() => {
    if (!open) return
    urlInputRef.current?.focus()
    urlInputRef.current?.select()
  }, [open])

  if (!open) return null

  const confirm = (): void => {
    onSubmit({ text, href, ...(title ? { title } : {}) })
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

  const primaryLabel = mode === 'edit' ? 'Update' : 'Insert'

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'edit' ? 'Edit link' : 'Insert link'}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="dialog-field">
          <label className="dialog-label" htmlFor="link-text">
            Text
          </label>
          <input
            id="link-text"
            type="text"
            className="dialog-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label="Text"
          />
        </div>

        <div className="dialog-field">
          <label className="dialog-label" htmlFor="link-url">
            URL
          </label>
          <input
            id="link-url"
            ref={urlInputRef}
            type="text"
            className="dialog-input"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder="https://"
            aria-label="URL"
          />
        </div>

        <div className="dialog-field">
          <label className="dialog-label" htmlFor="link-title">
            Title
          </label>
          <input
            id="link-title"
            type="text"
            className="dialog-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="optional"
            aria-label="Title"
          />
        </div>

        <div className="dialog-actions">
          {mode === 'edit' && (
            <>
              <button
                type="button"
                className="dialog-btn dialog-btn-danger"
                onClick={onRemove}
              >
                Remove link
              </button>
              <button
                type="button"
                className="dialog-btn"
                onClick={() => onOpenUrl(href)}
              >
                Open
              </button>
            </>
          )}
          <span className="dialog-spacer" />
          <button type="button" className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={confirm}
          >
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
