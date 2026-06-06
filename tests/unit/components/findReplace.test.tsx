/**
 * Tests for the FindReplace overlay component.
 *
 * Uses a mock EditorPaneHandle (all vi.fn()) passed via a RefObject so the
 * overlay's interactions can be verified without a real ProseMirror editor.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { createRef } from 'react'
import { FindReplace } from '../../../src/renderer/components/FindReplace'
import type { EditorPaneHandle } from '../../../src/renderer/editor/EditorPane'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Helper: build a mock EditorPaneHandle
// ---------------------------------------------------------------------------

function makeMockHandle() {
  const setFind = vi.fn(() => 2)
  const findNext = vi.fn()
  const findPrev = vi.fn()
  const replaceCurrent = vi.fn()
  const replaceAll = vi.fn(() => 3)
  const clearFind = vi.fn()
  const getMatchInfo = vi.fn(() => ({ current: 1, count: 2 }))

  const handle: EditorPaneHandle = {
    toggleMode: vi.fn(),
    getMode: vi.fn(() => 'wysiwyg' as const),
    getMarkdown: vi.fn(() => ''),
    setMarkdown: vi.fn(),
    focus: vi.fn(),
    scrollToPos: vi.fn(),
    runCommand: vi.fn(() => false),
    runTableCommand: vi.fn(() => false),
    getTableState: vi.fn(() => ({ inTable: false })),
    setFind,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAll,
    clearFind,
    getMatchInfo,
    getLinkAt: vi.fn(() => null),
    getSelectionText: vi.fn(() => ''),
    applyLink: vi.fn(),
    removeLink: vi.fn(),
    insertImage: vi.fn(),
  }

  const editorRef = createRef<EditorPaneHandle | null>()
  Object.defineProperty(editorRef, 'current', { value: handle, writable: true })

  return { editorRef, handle, setFind, findNext, findPrev, replaceCurrent, replaceAll, clearFind, getMatchInfo }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('FindReplace - rendering', () => {
  it('renders nothing when open=false', () => {
    const { editorRef } = makeMockHandle()
    const { container } = render(
      <FindReplace open={false} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the find input when open=true', () => {
    const { editorRef } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText('Find')).toBeTruthy()
  })

  it('does not render replace inputs in find mode', () => {
    const { editorRef } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    expect(screen.queryByLabelText('Replace with')).toBeNull()
  })

  it('renders replace input when mode=replace', () => {
    const { editorRef } = makeMockHandle()
    render(
      <FindReplace open={true} mode="replace" editorRef={editorRef} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText('Replace with')).toBeTruthy()
  })

  it('renders Replace and Replace All buttons in replace mode', () => {
    const { editorRef } = makeMockHandle()
    render(
      <FindReplace open={true} mode="replace" editorRef={editorRef} onClose={vi.fn()} />,
    )
    expect(screen.getByLabelText('Replace All')).toBeTruthy()
    expect(screen.getByLabelText('Replace current')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Query interaction
// ---------------------------------------------------------------------------

describe('FindReplace - query interaction', () => {
  it('typing a query calls editorRef.setFind with the query', () => {
    const { editorRef, setFind } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const input = screen.getByLabelText('Find')
    fireEvent.change(input, { target: { value: 'hello' } })
    expect(setFind).toHaveBeenCalledWith('hello', expect.objectContaining({ caseSensitive: false }))
  })

  it('calls setFind with caseSensitive:true when toggled', () => {
    const { editorRef, setFind } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const toggle = screen.getByLabelText('Case sensitive')
    fireEvent.click(toggle)

    const input = screen.getByLabelText('Find')
    fireEvent.change(input, { target: { value: 'hello' } })

    expect(setFind).toHaveBeenCalledWith('hello', expect.objectContaining({ caseSensitive: true }))
  })
})

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('FindReplace - navigation', () => {
  it('clicking next calls findNext()', () => {
    const { editorRef, findNext } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByLabelText('Next match'))
    expect(findNext).toHaveBeenCalled()
  })

  it('clicking prev calls findPrev()', () => {
    const { editorRef, findPrev } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    fireEvent.click(screen.getByLabelText('Previous match'))
    expect(findPrev).toHaveBeenCalled()
  })

  it('pressing Enter in find input calls findNext()', () => {
    const { editorRef, findNext } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const input = screen.getByLabelText('Find')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(findNext).toHaveBeenCalled()
  })

  it('pressing Shift+Enter in find input calls findPrev()', () => {
    const { editorRef, findPrev } = makeMockHandle()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const input = screen.getByLabelText('Find')
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(findPrev).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Replace actions
// ---------------------------------------------------------------------------

describe('FindReplace - replace actions', () => {
  it('clicking Replace calls replaceCurrent exactly once and does NOT call findNext', () => {
    // CONTRACT: replaceCurrent (in the plugin) owns the single advance to the
    // next match. FindReplace.tsx must NOT call findNext() after replaceCurrent,
    // or the advance would happen twice, skipping a match.
    const { editorRef, replaceCurrent, findNext } = makeMockHandle()
    render(
      <FindReplace open={true} mode="replace" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const replaceInput = screen.getByLabelText('Replace with')
    fireEvent.change(replaceInput, { target: { value: 'world' } })

    fireEvent.click(screen.getByLabelText('Replace current'))

    // replaceCurrent must be called exactly once with the replacement value.
    expect(replaceCurrent).toHaveBeenCalledTimes(1)
    expect(replaceCurrent).toHaveBeenCalledWith('world')

    // findNext must NOT be called by the component - the advance is owned by
    // replaceCurrent inside the plugin. A second call here would skip a match.
    expect(findNext).not.toHaveBeenCalled()
  })

  it('clicking Replace All calls replaceAll with the current query and replacement', () => {
    const { editorRef, replaceAll } = makeMockHandle()
    render(
      <FindReplace open={true} mode="replace" editorRef={editorRef} onClose={vi.fn()} />,
    )
    // Set query
    const findInput = screen.getByLabelText('Find')
    fireEvent.change(findInput, { target: { value: 'foo' } })

    // Set replace value
    const replaceInput = screen.getByLabelText('Replace with')
    fireEvent.change(replaceInput, { target: { value: 'bar' } })

    fireEvent.click(screen.getByLabelText('Replace All'))
    expect(replaceAll).toHaveBeenCalledWith('foo', 'bar', expect.objectContaining({ caseSensitive: false }))
  })
})

// ---------------------------------------------------------------------------
// Close / Escape
// ---------------------------------------------------------------------------

describe('FindReplace - close', () => {
  it('pressing Escape calls clearFind and onClose', () => {
    const { editorRef, clearFind } = makeMockHandle()
    const onClose = vi.fn()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={onClose} />,
    )
    const input = screen.getByLabelText('Find')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(clearFind).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('clicking the X close button calls clearFind and onClose', () => {
    const { editorRef, clearFind } = makeMockHandle()
    const onClose = vi.fn()
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={onClose} />,
    )
    fireEvent.click(screen.getByLabelText('Close'))
    expect(clearFind).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})

describe('FindReplace - seed from selection (WYSIWYG parity)', () => {
  it('prefills the find input with the editor selection on open', () => {
    const { editorRef, handle } = makeMockHandle()
    handle.getSelectionText = vi.fn(() => 'needle')
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const input = screen.getByLabelText('Find') as HTMLInputElement
    expect(input.value).toBe('needle')
  })

  it('does not seed from a multi-line selection', () => {
    const { editorRef, handle } = makeMockHandle()
    handle.getSelectionText = vi.fn(() => 'line one\nline two')
    render(
      <FindReplace open={true} mode="find" editorRef={editorRef} onClose={vi.fn()} />,
    )
    const input = screen.getByLabelText('Find') as HTMLInputElement
    expect(input.value).toBe('')
  })
})
