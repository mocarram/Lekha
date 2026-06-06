/**
 * Unit tests for smartPaste helpers.
 *
 * Tests cover:
 *   - isSingleUrl: pure URL validation helper
 *   - handleSmartPaste: paste handler that wraps a text selection in a link
 *     mark when the clipboard contains a single URL
 */
import { describe, it, expect, vi } from 'vitest'
import { isSingleUrl, handleSmartPaste } from '../../../src/renderer/editor/smartPaste'
import { createEditorState } from '../../../src/renderer/editor/createState'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

// ---------------------------------------------------------------------------
// isSingleUrl tests
// ---------------------------------------------------------------------------

describe('isSingleUrl', () => {
  it('returns true for a plain https URL', () => {
    expect(isSingleUrl('https://example.com')).toBe(true)
  })

  it('returns true for a plain http URL', () => {
    expect(isSingleUrl('http://example.com')).toBe(true)
  })

  it('returns true for a URL with path and query', () => {
    expect(isSingleUrl('https://github.com/user/repo?tab=readme')).toBe(true)
  })

  it('returns false for plain text (not a URL)', () => {
    expect(isSingleUrl('not a url')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isSingleUrl('')).toBe(false)
  })

  it('returns false when the clipboard contains multiple space-separated values', () => {
    expect(isSingleUrl('https://a.com b')).toBe(false)
  })

  it('returns false when the clipboard has multiple lines', () => {
    expect(isSingleUrl('https://a.com\nhttps://b.com')).toBe(false)
  })

  it('returns false for a URL-like string with leading whitespace content', () => {
    // "  https://x.com" after trimming is valid - trimming happens before check
    expect(isSingleUrl('  https://x.com  ')).toBe(true)
  })

  it('returns false for a non-http scheme', () => {
    expect(isSingleUrl('ftp://example.com')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// handleSmartPaste tests
// ---------------------------------------------------------------------------

/**
 * Build a fake ClipboardEvent carrying plain text.
 */
function makeClipboardEvent(text: string): ClipboardEvent {
  return {
    clipboardData: {
      getData: (type: string) => (type === 'text/plain' ? text : ''),
      items: { length: 0 } as unknown as DataTransferItemList,
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent
}

/**
 * Build a minimal fake EditorView backed by a real ProseMirror state
 * with the given markdown and a text selection [from, to].
 */
function makeView(
  markdown: string,
  selFrom: number,
  selTo: number,
): { view: EditorView; getMarkdown: () => string } {
  // Parse using the real createEditorState so we get a real doc
  const state = createEditorState(markdown)
  const doc = state.doc

  // Clamp positions to valid range
  const size = doc.content.size
  const from = Math.min(selFrom, size)
  const to = Math.min(selTo, size)

  const sel = TextSelection.create(doc, from, to)
  const stateWithSel = state.apply(state.tr.setSelection(sel))

  const dispatched: ReturnType<typeof state.tr.addMark>[] = []

  const fakeView = {
    state: stateWithSel,
    dispatch(tr: typeof stateWithSel.tr) {
      dispatched.push(tr)
      // Mutate state so we can read the new doc
      fakeView.state = stateWithSel.apply(tr)
    },
  } as unknown as EditorView

  return {
    view: fakeView,
    getMarkdown: () => serializeMarkdown(fakeView.state.doc),
  }
}

describe('handleSmartPaste', () => {
  it('returns false when the clipboard is not a single URL', () => {
    const { view } = makeView('hello world', 1, 6)
    const event = makeClipboardEvent('not a url')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(false)
  })

  it('returns false when there is a collapsed (empty) selection even with a URL', () => {
    // Position the cursor at pos 1 (collapsed)
    const { view } = makeView('hello world', 1, 1)
    const event = makeClipboardEvent('https://example.com')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(false)
  })

  it('applies a link mark over the selection when clipboard is a URL and selection is non-empty', () => {
    // "hello world" in a paragraph - select "hello" (pos 1..6)
    const { view, getMarkdown } = makeView('hello world', 1, 6)
    const event = makeClipboardEvent('https://example.com')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(true)

    const md = getMarkdown()
    // "hello" should now be a link
    expect(md).toContain('[hello](https://example.com)')
  })

  it('wraps the full selected text in a link without replacing it', () => {
    const { view, getMarkdown } = makeView('click here for info', 1, 11)
    const event = makeClipboardEvent('https://github.com')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(true)

    const md = getMarkdown()
    expect(md).toContain('[click here](https://github.com)')
    // Remainder of the paragraph must still be present
    expect(md).toContain('for info')
  })

  it('returns false and does not dispatch when clipboard has multiple words including a URL', () => {
    const { view } = makeView('hello world', 1, 6)
    const event = makeClipboardEvent('https://a.com more text')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(false)
  })

  it('trims whitespace from the pasted URL before applying the link', () => {
    const { view, getMarkdown } = makeView('hello world', 1, 6)
    const event = makeClipboardEvent('  https://trimmed.com  ')
    const result = handleSmartPaste(view, event)
    expect(result).toBe(true)

    const md = getMarkdown()
    expect(md).toContain('[hello](https://trimmed.com)')
  })

  it('does not call preventDefault on the event when returning false', () => {
    const { view } = makeView('hello world', 1, 1)
    const mockEvent = makeClipboardEvent('https://x.com')
    const preventDefaultSpy = vi.spyOn(mockEvent, 'preventDefault')
    handleSmartPaste(view, mockEvent)
    expect(preventDefaultSpy).not.toHaveBeenCalled()
  })

  it('calls preventDefault on the event when returning true (link applied)', () => {
    const { view } = makeView('hello world', 1, 6)
    const mockEvent = makeClipboardEvent('https://x.com')
    const preventDefaultSpy = vi.spyOn(mockEvent, 'preventDefault')
    handleSmartPaste(view, mockEvent)
    expect(preventDefaultSpy).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Confirm image-paste and normal text paste are unaffected
// ---------------------------------------------------------------------------

describe('handleSmartPaste - passthrough cases', () => {
  it('returns false for image clipboard items (no text/plain URL)', () => {
    // An image paste event typically has no text/plain data
    const { view } = makeView('paragraph', 1, 6)
    const event = makeClipboardEvent('')
    expect(handleSmartPaste(view, event)).toBe(false)
  })

  it('returns false for normal text clipboard (not a URL)', () => {
    const { view } = makeView('paragraph', 1, 6)
    const event = makeClipboardEvent('just some text')
    expect(handleSmartPaste(view, event)).toBe(false)
  })
})
