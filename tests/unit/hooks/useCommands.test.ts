/**
 * Unit tests for useCommands hook.
 *
 * Verifies that the hook correctly routes AppCommands to:
 *   - fileOps methods (new, open, save, etc.)
 *   - editorRef.runCommand() (formatting/block commands)
 *   - editorRef.toggleMode() (toggleSource)
 *   - useWorkspaceStore.toggleSidebar() (toggleSidebar)
 *   - onFind / onReplace callbacks
 *
 * window.lekha.onCommand is mocked to capture the registered callback.
 * Cleanup (unsubscribe) is verified on unmount.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useCommands } from '../../../src/renderer/hooks/useCommands'
import type { EditorPaneHandle } from '../../../src/renderer/editor/EditorPane'
import type { FileOps } from '../../../src/renderer/hooks/useFileOps'
import type { AppCommand } from '../../../src/shared/commands'
import type { LekhaAPI } from '../../../src/preload/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockEditorResult {
  ref: ReturnType<typeof createRef<EditorPaneHandle | null>>
  runCommand: ReturnType<typeof vi.fn>
  toggleMode: ReturnType<typeof vi.fn>
  getMode: ReturnType<typeof vi.fn>
}

function makeMockEditor(): MockEditorResult {
  const runCommand = vi.fn((_cmd: AppCommand) => true)
  // toggleMode now returns the new EditorMode synchronously
  const toggleMode = vi.fn(() => 'source' as const)
  const getMode = vi.fn(() => 'wysiwyg' as const)
  const getMarkdown = vi.fn(() => '')
  const setMarkdown = vi.fn()
  const focus = vi.fn()
  const scrollToPos = vi.fn()
  const setFind = vi.fn(() => 0)
  const findNext = vi.fn()
  const findPrev = vi.fn()
  const replaceCurrent = vi.fn()
  const replaceAll = vi.fn(() => 0)
  const clearFind = vi.fn()
  const getMatchInfo = vi.fn(() => ({ current: 0, count: 0 }))

  const handle: EditorPaneHandle = {
    runCommand,
    toggleMode,
    getMode,
    getMarkdown,
    setMarkdown,
    focus,
    scrollToPos,
    setFind,
    findNext,
    findPrev,
    replaceCurrent,
    replaceAll,
    clearFind,
    getMatchInfo,
  }

  const ref = createRef<EditorPaneHandle | null>()
  // Bypass read-only current for testing
  Object.defineProperty(ref, 'current', { value: handle, writable: true })

  return { ref, runCommand, toggleMode, getMode }
}

interface MockFileOpsResult {
  fileOps: FileOps
  newFile: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  openPath: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  saveAs: ReturnType<typeof vi.fn>
  openFolder: ReturnType<typeof vi.fn>
}

function makeMockFileOps(): MockFileOpsResult {
  const newFile = vi.fn()
  const open = vi.fn(() => Promise.resolve())
  const openPath = vi.fn(() => Promise.resolve())
  const save = vi.fn(() => Promise.resolve())
  const saveAs = vi.fn(() => Promise.resolve())
  const openFolder = vi.fn(() => Promise.resolve())
  const fileOps: FileOps = { newFile, open, openPath, save, saveAs, openFolder }
  return { fileOps, newFile, open, openPath, save, saveAs, openFolder }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Captured command dispatcher - set by stubGlobal before each test. */
let capturedDispatch: ((cmd: AppCommand) => void) | null = null
const unsubscribeMock = vi.fn()

function stubLekha(): void {
  capturedDispatch = null
  const mockLekha: Partial<LekhaAPI> = {
    onCommand: vi.fn((cb: (cmd: AppCommand) => void) => {
      capturedDispatch = cb
      return unsubscribeMock
    }),
  }
  vi.stubGlobal('lekha', mockLekha)
}

beforeEach(() => {
  unsubscribeMock.mockClear()
  useWorkspaceStore.setState({ sidebarVisible: true })
  stubLekha()
})

// ---------------------------------------------------------------------------
// Test: subscription lifecycle
// ---------------------------------------------------------------------------

describe('useCommands - subscription lifecycle', () => {
  it('registers onCommand listener on mount', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))

    // Verify onCommand was called; use capturedDispatch as the indicator
    // (avoids unbound-method lint on window.lekha.onCommand)
    expect(capturedDispatch).not.toBeNull()
  })

  it('calls unsubscribe on unmount', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    const { unmount } = renderHook(() =>
      useCommands(ref, fileOps, { onFind, onReplace }),
    )

    unmount()

    expect(unsubscribeMock).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Test: file operations routing
// ---------------------------------------------------------------------------

describe('useCommands - file operation routing', () => {
  it('dispatching "save" calls fileOps.save()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, save } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('save') })

    expect(save).toHaveBeenCalledOnce()
  })

  it('dispatching "new" calls fileOps.newFile()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, newFile } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('new') })

    expect(newFile).toHaveBeenCalledOnce()
  })

  it('dispatching "open" calls fileOps.open()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, open } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('open') })

    expect(open).toHaveBeenCalledOnce()
  })

  it('dispatching "saveAs" calls fileOps.saveAs()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, saveAs } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('saveAs') })

    expect(saveAs).toHaveBeenCalledOnce()
  })

  it('dispatching "openFolder" calls fileOps.openFolder()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, openFolder } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('openFolder') })

    expect(openFolder).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Test: editor formatting routing
// ---------------------------------------------------------------------------

describe('useCommands - editor command routing', () => {
  it('dispatching "bold" calls editorRef.runCommand("bold")', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('bold') })

    expect(runCommand).toHaveBeenCalledWith('bold')
  })

  it('dispatching "heading2" calls editorRef.runCommand("heading2")', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('heading2') })

    expect(runCommand).toHaveBeenCalledWith('heading2')
  })

  it('dispatching "undo" calls editorRef.runCommand("undo")', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('undo') })

    expect(runCommand).toHaveBeenCalledWith('undo')
  })
})

// ---------------------------------------------------------------------------
// Test: sidebar and source mode routing
// ---------------------------------------------------------------------------

describe('useCommands - sidebar and mode routing', () => {
  it('dispatching "toggleSidebar" calls useWorkspaceStore.toggleSidebar()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    useWorkspaceStore.setState({ sidebarVisible: true })

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('toggleSidebar') })

    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
  })

  it('dispatching "toggleSource" calls editorRef.toggleMode()', () => {
    const { ref, toggleMode } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('toggleSource') })

    expect(toggleMode).toHaveBeenCalledOnce()
  })

  it('dispatching "toggleSource" syncs the store mode from the returned value (no stale read)', () => {
    // toggleMode mock returns 'source' (the new mode after the first toggle)
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    useEditorStore.setState({ mode: 'wysiwyg' })

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('toggleSource') })

    // The store must reflect the NEW mode returned by toggleMode(), not a stale read.
    expect(useEditorStore.getState().mode).toBe('source')
  })
})

// ---------------------------------------------------------------------------
// Test: find / replace routing
// ---------------------------------------------------------------------------

describe('useCommands - find/replace routing', () => {
  it('dispatching "find" calls opts.onFind()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('find') })

    expect(onFind).toHaveBeenCalledOnce()
  })

  it('dispatching "replace" calls opts.onReplace()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('replace') })

    expect(onReplace).toHaveBeenCalledOnce()
  })
})
