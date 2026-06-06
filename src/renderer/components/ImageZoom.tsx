/**
 * ImageZoom - fullscreen lightbox overlay for image preview.
 *
 * Opened when the user clicks an image node in the WYSIWYG editor.
 * The image is displayed centered and scaled to fit within 90vw x 90vh.
 *
 * Dismiss by:
 *   - Clicking the dark backdrop (anywhere outside the image)
 *   - Pressing Escape
 *
 * Accessibility: role=dialog, Esc key, backdrop click.
 * Token-themed: uses --color-* CSS variables from global.css.
 */

import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImageZoomProps {
  /** Whether the lightbox is visible. */
  open: boolean
  /** The image source - may be a relative assets/ path, absolute file://, or URL. */
  src: string
  /** Alt text for the image. Defaults to empty string when omitted. */
  alt?: string
  /** Called when the user dismisses the lightbox. */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ImageZoom({ open, src, alt = '', onClose }: ImageZoomProps) {
  // Listen for Escape on the document so the user can dismiss without focus.
  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(e: globalThis.KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    // Backdrop: dark semi-transparent overlay. Clicking it closes the lightbox.
    <div
      className="image-zoom-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onClick={onClose}
    >
      {/* Image: stopPropagation so clicking the image doesn't close the dialog. */}
      <img
        src={src}
        alt={alt}
        className="image-zoom-img"
        onClick={(e) => e.stopPropagation()}
        // Keyboard users hitting Enter on the image should not close the dialog.
        onKeyDown={(e: ReactKeyboardEvent<HTMLImageElement>) => e.stopPropagation()}
      />
    </div>
  )
}
