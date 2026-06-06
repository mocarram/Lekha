/**
 * smartPaste.ts
 *
 * Provides a ProseMirror handlePaste hook that implements "URL-on-selection":
 * when the user has a non-empty text selection AND pastes a single HTTP/HTTPS
 * URL, the selected text is wrapped in a link mark instead of being replaced.
 *
 * Handler ordering in EditorView (see EditorView.tsx):
 *   1. Image paste (files in clipboard) - checked first; returns true if images.
 *   2. Smart paste (URL + selection)    - this module; returns true if applied.
 *   3. Default ProseMirror paste        - runs when both above return false.
 *
 * Returning false from this handler tells ProseMirror to continue with its own
 * paste logic (HTML-to-schema parse, plain-text insert, etc.) so normal and
 * HTML paste are completely unaffected.
 */

import type { EditorView } from 'prosemirror-view'
import { schema } from './schema'

// ---------------------------------------------------------------------------
// isSingleUrl - exported for unit testing
// ---------------------------------------------------------------------------

/**
 * Returns true if `text` (after trimming) is a single http or https URL with
 * no embedded whitespace. A "single" URL means the trimmed string contains no
 * space, tab, or newline - i.e. the user pasted only the URL and nothing else.
 */
export function isSingleUrl(text: string): boolean {
  const trimmed = text.trim()
  // Reject empty, multi-word, or multi-line strings immediately.
  if (!trimmed || /\s/.test(trimmed)) return false
  // Require http:// or https:// prefix (reject ftp://, file://, etc.).
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// handleSmartPaste - exported for EditorView wiring and unit testing
// ---------------------------------------------------------------------------

/**
 * ProseMirror handlePaste hook: wraps the current selection in a link mark
 * when the pasted text is a single URL and the selection is non-empty.
 *
 * Returns true (consumed) when a link is applied; false otherwise so the
 * default paste logic (text, HTML) runs normally.
 */
export function handleSmartPaste(view: EditorView, event: ClipboardEvent): boolean {
  // Only act on plain-text clipboard data - image items are handled upstream.
  // Guard against stub ClipboardEvent objects (e.g. in unit tests) that may
  // not implement getData. Return false to let the default paste logic run.
  if (typeof event.clipboardData?.getData !== 'function') return false
  const text = event.clipboardData.getData('text/plain') ?? ''

  // Must be a single URL...
  if (!isSingleUrl(text)) return false

  // ...and there must be a non-empty selection to wrap.
  const { from, to, empty } = view.state.selection
  if (empty) return false

  // Prevent the default paste (which would replace the selection with the URL).
  event.preventDefault()

  const url = text.trim()
  const linkMark = schema.marks['link']!.create({ href: url, title: null })
  const tr = view.state.tr.addMark(from, to, linkMark)
  view.dispatch(tr.scrollIntoView())
  return true
}
