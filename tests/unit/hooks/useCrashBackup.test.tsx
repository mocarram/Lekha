/**
 * Unit tests for the useCrashBackup hook.
 *
 * Uses renderHook + fake timers to verify the debounced backup write, the
 * blur flush, the dirty/active guards, Untitled coverage, and unmount cleanup
 * without touching any real file I/O. window.lekha.writeBackup is stubbed and
 * crypto.randomUUID is mocked for deterministic backupIds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { useCrashBackup } from '../../../src/renderer/hooks/useCrashBackup'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'
import type { EditorPaneHandle } from '../../../src/renderer/editor/EditorPane'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal EditorPaneHandle whose getMarkdown returns a fixed buffer. */
function makeMockEditor(markdown = '# Live') {
  const handle = {
    getMarkdown: vi.fn(() => markdown),
  } as unknown as EditorPaneHandle
  return handle
}

function refFor(handle: EditorPaneHandle) {
  const ref = createRef<EditorPaneHandle>()
  ;(ref as { current: EditorPaneHandle }).current = handle
  return ref
}

let writeBackup: ReturnType<typeof vi.fn>
let uuidSpy: ReturnType<typeof vi.spyOn>

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
  useEditorStore.getState().reset()
  useDocumentsStore.getState().reset()
  writeBackup = vi.fn(() => Promise.resolve())
  vi.stubGlobal('lekha', { writeBackup })
  uuidSpy = vi.spyOn(crypto, 'randomUUID').mockReturnValue(
    'uuid-1' as `${string}-${string}-${string}-${string}-${string}`,
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Seed a dirty active tab + editor store with a path. */
function seedDirty(path: string | null = '/a.md', md = '# Live') {
  useDocumentsStore.getState().openDocument({ path, markdown: md })
  useEditorStore.getState().openFile(path, md)
  useEditorStore.getState().markDirty()
  useDocumentsStore.getState().updateActive({ isDirty: true })
}

// ---------------------------------------------------------------------------
// Debounced write
// ---------------------------------------------------------------------------

describe('useCrashBackup - debounced write', () => {
  it('writes a backup after the debounce when the active doc is dirty', () => {
    const handle = makeMockEditor('# Edited')
    seedDirty('/a.md', '# Edited')
    renderHook(() => useCrashBackup(refFor(handle)))

    expect(writeBackup).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(5000) })

    expect(writeBackup).toHaveBeenCalledTimes(1)
    expect(writeBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        backupId: 'uuid-1',
        path: '/a.md',
        title: 'a.md',
        content: '# Edited',
        eol: 'lf',
      }),
    )
    // The active tab now has the assigned backupId.
    expect(useDocumentsStore.getState().activeDocument()!.backupId).toBe('uuid-1')
  })

  it('covers Untitled (path null) documents', () => {
    const handle = makeMockEditor('draft')
    seedDirty(null, 'draft')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { vi.advanceTimersByTime(5000) })

    expect(writeBackup).toHaveBeenCalledWith(
      expect.objectContaining({ path: null, content: 'draft' }),
    )
  })

  it('does NOT write when the active doc is clean', () => {
    const handle = makeMockEditor()
    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/a.md', '# A')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { vi.advanceTimersByTime(6000) })
    expect(writeBackup).not.toHaveBeenCalled()
  })

  it('reuses the existing backupId on a subsequent write', () => {
    const handle = makeMockEditor()
    seedDirty('/a.md')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(writeBackup).toHaveBeenCalledTimes(1)

    // Trigger another debounce cycle (clean->dirty) - same backupId reused. The
    // hook subscribes to the store imperatively, so these store mutations re-arm
    // the timer without any React re-render.
    act(() => { useEditorStore.getState().markClean() })
    act(() => { useEditorStore.getState().markDirty() })
    act(() => { vi.advanceTimersByTime(5000) })

    expect(writeBackup).toHaveBeenCalledTimes(2)
    expect(uuidSpy).toHaveBeenCalledTimes(1)
  })

  it('re-arms on each edit within ONE dirty session and backs up the latest buffer', () => {
    // Regression guard: a backup write does not mark the doc clean, so the
    // debounce must re-arm off each store change (the live content signal), not
    // just the isDirty flip - otherwise only the first ~5s snapshot of a long
    // editing session would ever be captured. The hook re-arms via an imperative
    // store subscription, so setMarkdown alone (no re-render) must re-arm it.
    let live = '# v1'
    const handle = { getMarkdown: vi.fn(() => live) } as unknown as EditorPaneHandle
    seedDirty('/a.md', '# v1')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { vi.advanceTimersByTime(5000) })
    expect(writeBackup).toHaveBeenCalledTimes(1)
    expect(writeBackup).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '# v1' }),
    )

    // Keep editing WITHOUT the doc going clean: update the live buffer and the
    // markdown signal the hook subscribes to. The imperative subscription must
    // re-arm the debounce off this store change alone.
    live = '# v2 with more text'
    act(() => { useEditorStore.getState().setMarkdown('# v2 with more text') })
    act(() => { vi.advanceTimersByTime(5000) })

    expect(writeBackup).toHaveBeenCalledTimes(2)
    expect(writeBackup).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '# v2 with more text' }),
    )
  })
})

// ---------------------------------------------------------------------------
// Blur flush
// ---------------------------------------------------------------------------

describe('useCrashBackup - blur flush', () => {
  it('writes immediately on window blur when dirty', () => {
    const handle = makeMockEditor()
    seedDirty('/a.md')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(writeBackup).toHaveBeenCalledTimes(1)
  })

  it('does NOT write on blur when clean', () => {
    const handle = makeMockEditor()
    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/a.md', '# A')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(writeBackup).not.toHaveBeenCalled()
  })

  it('blur cancels the pending debounce so the backup is not written twice', () => {
    const handle = makeMockEditor()
    seedDirty('/a.md')
    renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(writeBackup).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(6000) })
    expect(writeBackup).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Unmount cleanup
// ---------------------------------------------------------------------------

describe('useCrashBackup - unmount cleanup', () => {
  it('cancels the pending timer on unmount', () => {
    const handle = makeMockEditor()
    seedDirty('/a.md')
    const { unmount } = renderHook(() => useCrashBackup(refFor(handle)))

    act(() => { vi.advanceTimersByTime(2000) })
    unmount()
    act(() => { vi.advanceTimersByTime(6000) })
    expect(writeBackup).not.toHaveBeenCalled()
  })

  it('removes the blur listener on unmount', () => {
    const handle = makeMockEditor()
    seedDirty('/a.md')
    const { unmount } = renderHook(() => useCrashBackup(refFor(handle)))
    unmount()

    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(writeBackup).not.toHaveBeenCalled()
  })
})
