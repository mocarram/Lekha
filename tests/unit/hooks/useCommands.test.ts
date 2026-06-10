/**
 * Unit tests for useCommands hook.
 *
 * Verifies that the hook correctly routes AppCommands to:
 *   - fileOps methods (new, open, save, etc.)
 *   - editorRef.runCommand() (formatting/block commands)
 *   - editorRef.toggleMode() (toggleSource)
 *   - useWorkspaceStore.toggleSidebar() (toggleSidebar)
 *   - onFind / onReplace callbacks
 *   - export commands (exportHtml, exportPdf, exportDocx)
 *
 * window.lekha.onCommand is mocked to capture the registered callback.
 * Cleanup (unsubscribe) is verified on unmount.
 */

// Mock mermaid before any import that pulls in buildHtml (via useCommands -> buildExportHtml).
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))
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
  getLinkAt: ReturnType<typeof vi.fn>
  getSelectionText: ReturnType<typeof vi.fn>
  insertText: ReturnType<typeof vi.fn>
  applyLink: ReturnType<typeof vi.fn>
  removeLink: ReturnType<typeof vi.fn>
  insertImage: ReturnType<typeof vi.fn>
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
  const getLinkAt = vi.fn(() => null)
  const getSelectionText = vi.fn(() => '')
  const getPlainText = vi.fn(() => '')
  const insertText = vi.fn()
  const applyLink = vi.fn()
  const removeLink = vi.fn()
  const insertImage = vi.fn()

  const handle: EditorPaneHandle = {
    runCommand,
    runTableCommand: vi.fn(() => false),
    getTableState: vi.fn(() => ({ inTable: false })),
    toggleMode,
    getMode,
    getMarkdown,
    setMarkdown,
    focus,
    scrollToPos,
    setFind,
    findNext,
    gotoMatch: vi.fn(),
    refreshFind: vi.fn(),
    findPrev,
    replaceCurrent,
    replaceAll,
    clearFind,
    getMatchInfo,
    getLinkAt,
    getSelectionText,
    getPlainText,
    insertText,
    applyLink,
    removeLink,
    insertImage,
  }

  const ref = createRef<EditorPaneHandle | null>()
  // Bypass read-only current for testing
  Object.defineProperty(ref, 'current', { value: handle, writable: true })

  return {
    ref,
    runCommand,
    toggleMode,
    getMode,
    getLinkAt,
    getSelectionText,
    insertText,
    applyLink,
    removeLink,
    insertImage,
  }
}

interface MockFileOpsResult {
  fileOps: FileOps
  newFile: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  openPath: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  saveAs: ReturnType<typeof vi.fn>
  openFolder: ReturnType<typeof vi.fn>
  revertToSaved: ReturnType<typeof vi.fn>
  duplicateCurrent: ReturnType<typeof vi.fn>
  deleteCurrent: ReturnType<typeof vi.fn>
  moveCurrentTo: ReturnType<typeof vi.fn>
  saveAllForClose: ReturnType<typeof vi.fn>
  discardAllForClose: ReturnType<typeof vi.fn>
}

function makeMockFileOps(): MockFileOpsResult {
  const newFile = vi.fn()
  const open = vi.fn(() => Promise.resolve())
  const openPath = vi.fn(() => Promise.resolve())
  const save = vi.fn(() => Promise.resolve())
  const saveAs = vi.fn(() => Promise.resolve())
  const openFolder = vi.fn(() => Promise.resolve())
  const openFolderPath = vi.fn(() => Promise.resolve())
  const refreshTree = vi.fn(() => Promise.resolve())
  const guardUnsaved = vi.fn(() => Promise.resolve(true))
  const revertToSaved = vi.fn(() => Promise.resolve())
  const duplicateCurrent = vi.fn(() => Promise.resolve())
  const deleteCurrent = vi.fn(() => Promise.resolve())
  const moveCurrentTo = vi.fn(() => Promise.resolve())
  const selectTab = vi.fn(() => Promise.resolve())
  const closeTab = vi.fn(() => Promise.resolve())
  const saveAllForClose = vi.fn(() => Promise.resolve())
  const discardAllForClose = vi.fn(() => Promise.resolve())
  const syncActivePath = vi.fn()
  const createFileEntry = vi.fn(() => Promise.resolve())
  const createFolderEntry = vi.fn(() => Promise.resolve())
  const renameEntry = vi.fn(() => Promise.resolve())
  const deleteEntry = vi.fn(() => Promise.resolve())
  const revealEntry = vi.fn()
  const verifyActiveDoc = vi.fn(() => Promise.resolve())
  const resetToBlank = vi.fn()
  const fileOps: FileOps = { newFile, open, openPath, save, saveAs, openFolder, saveQuiet: vi.fn(() => Promise.resolve()), openFolderPath, refreshTree, refreshDiskSig: vi.fn(() => Promise.resolve()), guardUnsaved, revertToSaved, duplicateCurrent, deleteCurrent, moveCurrentTo, selectTab, closeTab, saveAllForClose, discardAllForClose, syncActivePath, createFileEntry, createFolderEntry, renameEntry, deleteEntry, revealEntry, verifyActiveDoc, resetToBlank }
  return { fileOps, newFile, open, openPath, save, saveAs, openFolder, revertToSaved, duplicateCurrent, deleteCurrent, moveCurrentTo, saveAllForClose, discardAllForClose }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Captured command dispatcher - set by stubGlobal before each test. */
let capturedDispatch: ((cmd: AppCommand) => void) | null = null
const unsubscribeMock = vi.fn()

/**
 * Poll until `mock` has been called at least once, or time out.
 *
 * The export/copy-as-HTML commands now dynamic-import the export pipeline
 * (buildHtml.ts) on first use - a cold dynamic import that can take longer than
 * a fixed flush delay. Polling makes these tests robust to that one-time load
 * latency without weakening the assertion (they still verify the mock fires).
 */
async function waitForCall(
  mock: ReturnType<typeof vi.fn>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now()
  while (mock.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('timed out waiting for mock to be called')
    }
    await new Promise((r) => setTimeout(r, 10))
  }
}

function stubLekha(): void {
  capturedDispatch = null
  const mockLekha: Partial<LekhaAPI> = {
    onCommand: vi.fn((cb: (cmd: AppCommand) => void) => {
      capturedDispatch = cb
      return unsubscribeMock
    }),
    onOpenPath: vi.fn(() => () => undefined),
    newWindow: vi.fn(),
    print: vi.fn(),
    share: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
    readClipboardText: vi.fn(() => Promise.resolve('')),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportPandoc: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
    saveImage: vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' })),
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))

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
      useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }),
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('save') })

    expect(save).toHaveBeenCalledOnce()
  })

  it('dispatching "new" calls fileOps.newFile()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, newFile } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('new') })

    expect(newFile).toHaveBeenCalledOnce()
  })

  it('dispatching "newWindow" calls window.lekha.newWindow()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('newWindow') })

    const { newWindow } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(newWindow).toHaveBeenCalledOnce()
  })

  it('dispatching "print" calls window.lekha.print()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('print') })

    const { print } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(print).toHaveBeenCalledOnce()
  })

  it('dispatching "share" calls window.lekha.share() with the current path', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    useEditorStore.setState({ path: '/docs/a.md' })

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('share') })

    const { share } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(share).toHaveBeenCalledWith('/docs/a.md')
  })

  it('dispatching "open" calls fileOps.open()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, open } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('open') })

    expect(open).toHaveBeenCalledOnce()
  })

  it('dispatching "saveAs" calls fileOps.saveAs()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, saveAs } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('saveAs') })

    expect(saveAs).toHaveBeenCalledOnce()
  })

  it('dispatching "revertToSaved" calls fileOps.revertToSaved()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, revertToSaved } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('revertToSaved') })

    expect(revertToSaved).toHaveBeenCalledOnce()
  })

  it('dispatching "duplicateFile" calls fileOps.duplicateCurrent()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, duplicateCurrent } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('duplicateFile') })

    expect(duplicateCurrent).toHaveBeenCalledOnce()
  })

  it('dispatching "renameFile" calls the onRename option', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()
    const onRename = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn(), onRename }))
    act(() => { capturedDispatch!('renameFile') })

    expect(onRename).toHaveBeenCalledOnce()
  })

  it('dispatching "getInfo" calls the onGetInfo option', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()
    const onGetInfo = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn(), onGetInfo }))
    act(() => { capturedDispatch!('getInfo') })

    expect(onGetInfo).toHaveBeenCalledOnce()
  })

  it('dispatching "moveFileTo" calls fileOps.moveCurrentTo()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, moveCurrentTo } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('moveFileTo') })

    expect(moveCurrentTo).toHaveBeenCalledOnce()
  })

  it('dispatching "discardAllAndClose" calls fileOps.discardAllForClose()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, discardAllForClose } = makeMockFileOps()

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('discardAllAndClose') })

    expect(discardAllForClose).toHaveBeenCalledOnce()
  })

  it('dispatching "saveAllAndClose" calls fileOps.saveAllForClose()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, saveAllForClose } = makeMockFileOps()

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('saveAllAndClose') })

    expect(saveAllForClose).toHaveBeenCalledOnce()
  })

  it('dispatching "openFolder" calls fileOps.openFolder()', () => {
    const { ref } = makeMockEditor()
    const { fileOps, openFolder } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('bold') })

    expect(runCommand).toHaveBeenCalledWith('bold')
  })

  it('dispatching "heading2" calls editorRef.runCommand("heading2")', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('heading2') })

    expect(runCommand).toHaveBeenCalledWith('heading2')
  })

  it('dispatching "undo" calls editorRef.runCommand("undo")', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('toggleSidebar') })

    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
  })

  it('dispatching "revealInLibrary" shows the Articles tab', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    useWorkspaceStore.setState({ sidebarVisible: false, sidebarTab: 'files' })

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('revealInLibrary') })

    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true)
    expect(useWorkspaceStore.getState().sidebarTab).toBe('articles')
  })

  it('dispatching "pasteAsPlainText" reads the clipboard and inserts text', async () => {
    const { ref, ...rest } = makeMockEditor()
    const { fileOps } = makeMockFileOps()

    const mock = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    mock.readClipboardText = vi.fn(() => Promise.resolve('pasted'))

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('pasteAsPlainText') })

    await waitForCall(rest.insertText)
    expect(rest.insertText).toHaveBeenCalledWith('pasted')
  })

  it('dispatching "copyAsPlainText" writes plain text to the clipboard', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('copyAsPlainText') })

    const { writeClipboard } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    await waitForCall(writeClipboard!)
    expect(writeClipboard).toHaveBeenCalled()
  })

  it('dispatching "toggleStatusBar" flips the workspace store flag', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    useWorkspaceStore.setState({ showStatusBar: true })

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('toggleStatusBar') })

    expect(useWorkspaceStore.getState().showStatusBar).toBe(false)
  })

  it('dispatching "toggleAlwaysOnTop" sets the store and calls the IPC', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    useWorkspaceStore.setState({ alwaysOnTop: false })

    renderHook(() => useCommands(ref, fileOps, { onFind: vi.fn(), onReplace: vi.fn(), onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('toggleAlwaysOnTop') })

    expect(useWorkspaceStore.getState().alwaysOnTop).toBe(true)
    const { setAlwaysOnTop } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
  })

  it('dispatching "toggleSource" calls editorRef.toggleMode()', () => {
    const { ref, toggleMode } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
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

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('find') })

    expect(onFind).toHaveBeenCalledOnce()
  })

  it('dispatching "replace" calls opts.onReplace()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('replace') })

    expect(onReplace).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Test: export command routing
// ---------------------------------------------------------------------------

describe('useCommands - export command routing', () => {
  it('dispatching "exportHtml" calls window.lekha.exportHtml with html and suggestedName', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    // Make getMarkdown return something testable
    const handle = ref.current!
    vi.spyOn(handle, 'getMarkdown').mockReturnValue('# Hello')

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('exportHtml') })

    // exportHtml is async: it dynamic-imports the export pipeline then calls the
    // mock. Poll until the mock fires (cold import can exceed a fixed delay).
    // Destructure from the stubbed global so ESLint does not flag unbound-method.
    const { exportHtml } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    await waitForCall(exportHtml!)
    expect(exportHtml).toHaveBeenCalledOnce()
    const firstCall = exportHtml?.mock.calls[0] as [{ html: string; suggestedName: string }] | undefined
    const callArgs = firstCall?.[0]
    expect(callArgs?.html).toContain('<!DOCTYPE html>')
    expect(callArgs?.suggestedName).toMatch(/\.html$/)
  })

  it('dispatching "exportPdf" calls window.lekha.exportPdf', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace, onLink: vi.fn(), onInsertImage: vi.fn(), onPreferences: vi.fn(), onCommandPalette: vi.fn(), onQuickOpen: vi.fn(), onPresentation: vi.fn(), onNewFromTemplate: vi.fn() }))
    act(() => { capturedDispatch!('exportPdf') })

    const { exportPdf } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    await waitForCall(exportPdf!)
    expect(exportPdf).toHaveBeenCalledOnce()
  })

  const pandocCases: { cmd: AppCommand; format: string; ext: RegExp }[] = [
    { cmd: 'exportDocx', format: 'docx', ext: /\.docx$/ },
    { cmd: 'exportEpub', format: 'epub', ext: /\.epub$/ },
    { cmd: 'exportRtf', format: 'rtf', ext: /\.rtf$/ },
    { cmd: 'exportLatex', format: 'latex', ext: /\.tex$/ },
    { cmd: 'exportOpml', format: 'opml', ext: /\.opml$/ },
  ]

  for (const { cmd, format, ext } of pandocCases) {
    it(`dispatching "${cmd}" calls exportPandoc with format "${format}" and markdown`, () => {
      const { ref } = makeMockEditor()
      const { fileOps } = makeMockFileOps()

      const handle = ref.current!
      vi.spyOn(handle, 'getMarkdown').mockReturnValue('# My Doc')

      renderHook(() =>
        useCommands(ref, fileOps, {
          onFind: vi.fn(),
          onReplace: vi.fn(),
          onLink: vi.fn(),
          onInsertImage: vi.fn(),
          onPreferences: vi.fn(),
          onCommandPalette: vi.fn(),
          onQuickOpen: vi.fn(),
          onPresentation: vi.fn(),
          onNewFromTemplate: vi.fn(),
        }),
      )
      act(() => {
        capturedDispatch!(cmd)
      })

      const { exportPandoc } = window.lekha as unknown as Record<
        string,
        ReturnType<typeof vi.fn>
      >
      expect(exportPandoc).toHaveBeenCalledOnce()
      const firstCall = exportPandoc?.mock.calls[0] as
        | [{ markdown: string; suggestedName: string; format: string }]
        | undefined
      const callArgs = firstCall?.[0]
      expect(callArgs?.markdown).toBe('# My Doc')
      expect(callArgs?.format).toBe(format)
      expect(callArgs?.suggestedName).toMatch(ext)
    })
  }
})

// ---------------------------------------------------------------------------
// Test: copy as html / markdown routing
// ---------------------------------------------------------------------------

describe('useCommands - copy as html/markdown routing', () => {
  it('dispatching "copyAsMarkdown" writes the markdown to the clipboard', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()

    const handle = ref.current!
    vi.spyOn(handle, 'getMarkdown').mockReturnValue('# Hello\n\nworld')

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('copyAsMarkdown') })

    const { writeClipboard } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    expect(writeClipboard).toHaveBeenCalledOnce()
    const firstCall = writeClipboard?.mock.calls[0] as [{ text?: string; html?: string }] | undefined
    expect(firstCall?.[0]?.text).toBe('# Hello\n\nworld')
    // Markdown copy must not set the html field.
    expect(firstCall?.[0]?.html).toBeUndefined()
  })

  it('dispatching "copyAsHtml" builds HTML and writes html + text to the clipboard', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()

    const handle = ref.current!
    vi.spyOn(handle, 'getMarkdown').mockReturnValue('# Title')

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('copyAsHtml') })

    // copyAsHtml is async: it dynamic-imports the export pipeline then calls
    // writeClipboard. Poll until the mock fires (cold import latency).
    const { writeClipboard } = window.lekha as unknown as Record<string, ReturnType<typeof vi.fn>>
    await waitForCall(writeClipboard!)
    expect(writeClipboard).toHaveBeenCalledOnce()
    const firstCall = writeClipboard?.mock.calls[0] as [{ text?: string; html?: string }] | undefined
    expect(firstCall?.[0]?.html).toContain('<!DOCTYPE html>')
    // Plain-text fallback is the markdown source.
    expect(firstCall?.[0]?.text).toBe('# Title')
  })
})

// ---------------------------------------------------------------------------
// Test: link / image dialog routing
// ---------------------------------------------------------------------------

describe('useCommands - link/image dialog routing', () => {
  it('dispatching "link" with a link at the cursor opens the dialog in edit mode', () => {
    const { ref, getLinkAt } = makeMockEditor()
    getLinkAt.mockReturnValue({
      href: 'https://example.com',
      text: 'docs',
      from: 1,
      to: 5,
    })
    const { fileOps } = makeMockFileOps()
    const onLink = vi.fn()
    const onInsertImage = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink,
        onInsertImage,
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('link') })

    expect(onLink).toHaveBeenCalledTimes(1)
    const arg = onLink.mock.calls[0]?.[0] as {
      mode: 'insert' | 'edit'
      initial: { text: string; href: string }
    }
    expect(arg.mode).toBe('edit')
    expect(arg.initial.href).toBe('https://example.com')
    expect(arg.initial.text).toBe('docs')
  })

  it('dispatching "link" with no link opens the dialog in insert mode using the selection text', () => {
    const { ref, getLinkAt, getSelectionText } = makeMockEditor()
    getLinkAt.mockReturnValue(null)
    getSelectionText.mockReturnValue('selected words')
    const { fileOps } = makeMockFileOps()
    const onLink = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink,
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('link') })

    expect(onLink).toHaveBeenCalledTimes(1)
    const arg = onLink.mock.calls[0]?.[0] as {
      mode: 'insert' | 'edit'
      initial: { text: string; href: string }
    }
    expect(arg.mode).toBe('insert')
    expect(arg.initial.text).toBe('selected words')
    expect(arg.initial.href).toBe('')
  })

  it('dispatching "insertImage" opens the image dialog', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onInsertImage = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage,
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('insertImage') })

    expect(onInsertImage).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Test: preferences routing
// ---------------------------------------------------------------------------

describe('useCommands - preferences routing', () => {
  it('dispatching "preferences" opens the Preferences modal', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onPreferences = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences,
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('preferences') })

    expect(onPreferences).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Test: command palette / quick-open routing
// ---------------------------------------------------------------------------

describe('useCommands - command palette / quick-open routing', () => {
  it('dispatching "commandPalette" calls opts.onCommandPalette()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onCommandPalette = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette,
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('commandPalette') })

    expect(onCommandPalette).toHaveBeenCalledTimes(1)
  })

  it('dispatching "quickOpen" calls opts.onQuickOpen()', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onQuickOpen = vi.fn()

    renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen,
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )
    act(() => { capturedDispatch!('quickOpen') })

    expect(onQuickOpen).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Test: the hook returns the shared dispatch (palette reuses it)
// ---------------------------------------------------------------------------

describe('useCommands - returned dispatch', () => {
  it('returns a dispatch that routes commands through the same path', () => {
    const { ref, runCommand } = makeMockEditor()
    const { fileOps, save } = makeMockFileOps()

    const { result } = renderHook(() =>
      useCommands(ref, fileOps, {
        onFind: vi.fn(),
        onReplace: vi.fn(),
        onLink: vi.fn(),
        onInsertImage: vi.fn(),
        onPreferences: vi.fn(),
        onCommandPalette: vi.fn(),
        onQuickOpen: vi.fn(),
        onPresentation: vi.fn(),
        onNewFromTemplate: vi.fn(),
      }),
    )

    // Calling the returned dispatch directly (as the palette does) routes a
    // file op and an editor command exactly like the IPC-driven path.
    act(() => { result.current('save') })
    act(() => { result.current('bold') })

    expect(save).toHaveBeenCalledOnce()
    expect(runCommand).toHaveBeenCalledWith('bold')
  })
})
