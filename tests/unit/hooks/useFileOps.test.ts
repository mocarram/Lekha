/**
 * Unit tests for useFileOps hook.
 *
 * window.lekha is stubbed via vi.stubGlobal so the Electron preload bridge
 * is never needed. The editorRef is a plain object that mirrors EditorPaneHandle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { createRef } from 'react'
import { useFileOps } from '../../../src/renderer/hooks/useFileOps'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'
import type { EditorPaneHandle } from '../../../src/renderer/editor/EditorPane'
import type { LekhaAPI } from '../../../src/preload/api'
import type { FileNode } from '../../../src/shared/types'
import { loadedDirPaths } from '../../../src/renderer/store/treeOps'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fresh mock EditorPaneHandle.
 * All fn references are standalone vi.fn() so they can be used in expect()
 * without triggering the unbound-method lint rule.
 */
function makeMockEditor(initialMarkdown = '# X') {
  const getMarkdown = vi.fn(() => initialMarkdown)
  const setMarkdown = vi.fn()
  const getMode = vi.fn(() => 'wysiwyg' as const)
  // toggleMode now returns the new EditorMode synchronously
  const toggleMode = vi.fn(() => 'source' as const)
  const focus = vi.fn()
  const scrollToPos = vi.fn()
  const runCommand = vi.fn(() => false)
  const setFind = vi.fn(() => 0)
  const findNext = vi.fn()
  const findPrev = vi.fn()
  const replaceCurrent = vi.fn()
  const replaceAll = vi.fn(() => 0)
  const clearFind = vi.fn()
  const getMatchInfo = vi.fn(() => ({ current: 0, count: 0 }))
  const handle: EditorPaneHandle = {
    getMarkdown,
    setMarkdown,
    getMode,
    toggleMode,
    focus,
    scrollToPos,
    runCommand,
    runTableCommand: vi.fn(() => false),
    getTableState: vi.fn(() => ({ inTable: false })),
    setFind,
    findNext,
    gotoMatch: vi.fn(),
    refreshFind: vi.fn(),
    findPrev,
    replaceCurrent,
    replaceAll,
    clearFind,
    getMatchInfo,
    getLinkAt: vi.fn(() => null),
    getSelectionText: vi.fn(() => ''),
    getPlainText: vi.fn(() => ''),
    insertText: vi.fn(),
    applyLink: vi.fn(),
    removeLink: vi.fn(),
    insertImage: vi.fn(),
  }
  return { handle, setMarkdown, getMarkdown }
}

/** Build a mock LekhaAPI with sensible defaults. */
function makeMockLekha(overrides: Partial<LekhaAPI> = {}): LekhaAPI {
  return {
    openFileDialog: vi.fn(() => Promise.resolve(null as string | null)),
    openFolderDialog: vi.fn(() => Promise.resolve(null as string | null)),
    saveAsDialog: vi.fn(() => Promise.resolve(null as string | null)),
    confirmUnsaved: vi.fn(() => Promise.resolve('cancel' as const)),
    confirmReplace: vi.fn(() => Promise.resolve(false)),
    readFile: vi.fn((_p: string) => Promise.resolve('# Loaded')),
    statFile: vi.fn(() => Promise.resolve({ sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0, inode: 0 })),
    getPathForFile: vi.fn(() => ''),
    verifyOpenFile: vi.fn(() => Promise.resolve({ status: 'present' as const })),
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([] as FileNode[])),
    watchFolder: vi.fn(() => Promise.resolve()),
    listArticles: vi.fn(() => Promise.resolve([])),
    createFile: vi.fn(() => Promise.resolve('')),
    createFolder: vi.fn(() => Promise.resolve('')),
    renamePath: vi.fn(() => Promise.resolve('')),
    duplicatePath: vi.fn(() => Promise.resolve('')),
    movePath: vi.fn(() => Promise.resolve('')),
    deletePath: vi.fn(() => Promise.resolve()),
    revealPath: vi.fn(() => Promise.resolve()),
    getSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
        theme: 'github',
        focusMode: false,
        typewriterMode: false,
        equationNumbering: true,
        fontSize: 16,
        autoSave: true,
        spellCheck: true,
        spellCheckLanguage: 'en-US',
        smartPunctuation: true,
        sidebarWidth: 240,
        openTabPaths: [],
    pinnedTabPaths: [],    zoomFactor: 1, folderColors: {},
        activeTabPath: null,
      }),
    ),
    setSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
        theme: 'github',
        focusMode: false,
        typewriterMode: false,
        equationNumbering: true,
        fontSize: 16,
        autoSave: true,
        spellCheck: true,
        spellCheckLanguage: 'en-US',
        smartPunctuation: true,
        sidebarWidth: 240,
        openTabPaths: [],
    pinnedTabPaths: [],    zoomFactor: 1, folderColors: {},
        activeTabPath: null,
      }),
    ),
    getRecentFiles: vi.fn(() => Promise.resolve([] as string[])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    setWindowDirty: vi.fn(),
    newWindow: vi.fn(),
    print: vi.fn(),
    share: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    onCommand: vi.fn(() => () => undefined),
    onOpenPath: vi.fn(() => () => undefined),
    onFolderChanged: vi.fn(() => () => undefined),
    takePendingOpen: vi.fn(() => Promise.resolve([])),
    shouldRestoreSession: vi.fn(() => Promise.resolve(true)),    adjustZoom: vi.fn(() => Promise.resolve(1)),
    checkForUpdates: vi.fn(() => Promise.resolve({ channel: "homebrew" as const, currentVersion: "0.1.0", latestVersion: null, updateAvailable: false, error: false })),
    getAppInfo: vi.fn(() => Promise.resolve({ version: "0.1.0", channel: "homebrew" as const })),
    setFolderColor: vi.fn(() => Promise.resolve()),
    onSetTheme: vi.fn(() => () => undefined),
    onSetAutoSave: vi.fn(() => () => undefined),
    writeBackup: vi.fn(() => Promise.resolve()),
    deleteBackup: vi.fn(() => Promise.resolve()),
    listBackups: vi.fn(() => Promise.resolve([])),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportPandoc: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
    saveImage: vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' })),
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
    readClipboardText: vi.fn(() => Promise.resolve('')),
    searchFolder: vi.fn(() => Promise.resolve([])),
    replaceInFolder: vi.fn(() => Promise.resolve({ filesChanged: 0, replacements: 0, changedPaths: [] })),
    listTemplates: vi.fn(() => Promise.resolve([])),
    listThemes: vi.fn(() => Promise.resolve([])),
    reloadThemes: vi.fn(() => Promise.resolve([])),
    openThemeFolder: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useEditorStore.getState().reset()
  useDocumentsStore.getState().reset()
  useWorkspaceStore.setState({
    rootFolder: null,
    fileTree: [],
    recentFiles: [],
    sidebarVisible: true,
    sidebarTab: 'files',
  })
})

// ---------------------------------------------------------------------------
// open()
// ---------------------------------------------------------------------------

describe('useFileOps - open()', () => {
  it('calls openFileDialog and, when a path is returned, reads the file and populates the editor', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# Note'))
    const addRecentFile = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ openFileDialog, readFile, addRecentFile })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    expect(openFileDialog).toHaveBeenCalledOnce()
    expect(readFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setMarkdown).toHaveBeenCalledWith('# Note')
    expect(useEditorStore.getState().path).toBe('/docs/note.md')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(addRecentFile).toHaveBeenCalledWith('/docs/note.md')
  })

  it('does nothing when openFileDialog returns null', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve(null as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve(''))
    const mockLekha = makeMockLekha({ openFileDialog, readFile })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    expect(readFile).not.toHaveBeenCalled()
    expect(setMarkdown).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// openPath()
// ---------------------------------------------------------------------------

describe('useFileOps - openPath()', () => {
  it('reads file, updates editor and store, adds to recents, and calls setDocumentState', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const readFile = vi.fn((_p: string) => Promise.resolve('## Chapter'))
    const getRecentFiles = vi.fn(() => Promise.resolve(['/docs/note.md']))
    const addRecentFile = vi.fn(() => Promise.resolve())
    const setDocumentState = vi.fn()
    const mockLekha = makeMockLekha({ readFile, getRecentFiles, addRecentFile, setDocumentState })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openPath('/docs/note.md') })

    expect(readFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setMarkdown).toHaveBeenCalledWith('## Chapter')
    expect(useEditorStore.getState().path).toBe('/docs/note.md')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(addRecentFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setDocumentState).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/docs/note.md', dirty: false }),
    )
  })

  it('shows an error and adds no tab when the file cannot be read', async () => {
    const { handle } = makeMockEditor()
    const readFile = vi.fn(() => Promise.reject(new Error('ENOENT')))
    const mockLekha = makeMockLekha({ readFile })
    vi.stubGlobal('lekha', mockLekha)
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openPath('/missing.md') })

    expect(alertSpy).toHaveBeenCalledOnce()
    expect(useDocumentsStore.getState().documents).toEqual([])
  })

  it('does not clobber an existing blank tab when the read fails (bug 13)', async () => {
    const { handle } = makeMockEditor()
    const readFile = vi.fn(() => Promise.reject(new Error('EACCES')))
    const mockLekha = makeMockLekha({ readFile })
    vi.stubGlobal('lekha', mockLekha)
    vi.stubGlobal('alert', vi.fn())

    // Seed a blank Untitled tab (the welcome/blank tab) - the reuse-blank path.
    useDocumentsStore.getState().newDocument()
    const before = useDocumentsStore.getState().activeDocument()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openPath('/missing.md') })

    // The blank tab is untouched: still one tab, still path null + empty.
    expect(useDocumentsStore.getState().documents).toHaveLength(1)
    const after = useDocumentsStore.getState().activeDocument()
    expect(after?.id).toBe(before?.id)
    expect(after?.path).toBeNull()
    expect(after?.markdown).toBe('')
  })
})

// ---------------------------------------------------------------------------
// save()
// ---------------------------------------------------------------------------

describe('useFileOps - save()', () => {
  it('writes current markdown to the existing path and clears dirty flag', async () => {
    const { handle } = makeMockEditor('# Saved Content')
    const writeFile = vi.fn(() => Promise.resolve())
    const addRecentFile = vi.fn(() => Promise.resolve())
    const setDocumentState = vi.fn()
    const mockLekha = makeMockLekha({ writeFile, addRecentFile, setDocumentState })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/notes/file.md', '# Saved Content')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.save() })

    expect(writeFile).toHaveBeenCalledWith('/notes/file.md', '# Saved Content')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(addRecentFile).toHaveBeenCalledWith('/notes/file.md')
    expect(setDocumentState).toHaveBeenCalledWith(
      expect.objectContaining({ dirty: false, path: '/notes/file.md' }),
    )
  })

  it('falls through to saveAs when there is no current path', async () => {
    const { handle } = makeMockEditor('# New')
    const saveAsDialog = vi.fn(() => Promise.resolve(null as string | null))
    const writeFile = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ saveAsDialog, writeFile })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.save() })

    expect(saveAsDialog).toHaveBeenCalledOnce()
    expect(writeFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// save() - concurrent external-edit guard (prevents silent overwrite)
// ---------------------------------------------------------------------------

/** statFile mock whose mtime changes between the open baseline and the next read. */
function changingStat(mtimes: number[]) {
  let i = 0
  return vi.fn(() => {
    const mtimeMs = mtimes[Math.min(i, mtimes.length - 1)] ?? 0
    i++
    return Promise.resolve({ sizeBytes: 0, birthtimeMs: 0, mtimeMs, inode: 1 })
  })
}

describe('useFileOps - save() external-change guard', () => {
  it('prompts before overwriting a file changed on disk and ABORTS on cancel', async () => {
    const { handle } = makeMockEditor('# Edited in Lekha')
    // open baseline mtime=100, then pre-write check sees mtime=200 (changed).
    const statFile = changingStat([100, 200])
    const writeFile = vi.fn(() => Promise.resolve())
    vi.stubGlobal('lekha', makeMockLekha({ statFile, writeFile }))
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => { await result.current.openPath('/docs/note.md') })
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })

    expect(confirmSpy).toHaveBeenCalledOnce()
    expect(writeFile).not.toHaveBeenCalled()
    // Aborted - work is preserved (still dirty), NOT discarded.
    expect(useEditorStore.getState().isDirty).toBe(true)
  })

  it('overwrites when the user confirms the on-disk change', async () => {
    const { handle } = makeMockEditor('# Edited in Lekha')
    const statFile = changingStat([100, 200, 200])
    const writeFile = vi.fn(() => Promise.resolve())
    vi.stubGlobal('lekha', makeMockLekha({ statFile, writeFile }))
    vi.stubGlobal('confirm', vi.fn(() => true))

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => { await result.current.openPath('/docs/note.md') })
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })

    expect(writeFile).toHaveBeenCalledWith('/docs/note.md', '# Edited in Lekha')
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('does NOT prompt when the on-disk signature is unchanged', async () => {
    const { handle } = makeMockEditor('# Edited in Lekha')
    const statFile = changingStat([100]) // every read returns the same mtime
    const writeFile = vi.fn(() => Promise.resolve())
    vi.stubGlobal('lekha', makeMockLekha({ statFile, writeFile }))
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => { await result.current.openPath('/docs/note.md') })
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledOnce()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// save() - write-failure surfacing (no silent "saved" when the write failed)
// ---------------------------------------------------------------------------

describe('useFileOps - save() write failure', () => {
  it('alerts and keeps the document dirty when the write fails', async () => {
    const { handle } = makeMockEditor('# Content')
    const writeFile = vi.fn(() => Promise.reject(new Error('EACCES: permission denied')))
    vi.stubGlobal('lekha', makeMockLekha({ writeFile }))
    const alertSpy = vi.fn()
    vi.stubGlobal('alert', alertSpy)

    useEditorStore.getState().openFile('/notes/file.md', '# Content')
    useEditorStore.getState().markDirty()
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => { await result.current.save() })

    expect(writeFile).toHaveBeenCalledOnce()
    expect(alertSpy).toHaveBeenCalledOnce()
    // The user is NOT told it saved: the document remains dirty.
    expect(useEditorStore.getState().isDirty).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// saveAs()
// ---------------------------------------------------------------------------

describe('useFileOps - saveAs()', () => {
  it('opens dialog, writes file, updates path in store', async () => {
    const { handle } = makeMockEditor('# Content')
    const saveAsDialog = vi.fn(() => Promise.resolve('/new/path/file.md' as string | null))
    const writeFile = vi.fn(() => Promise.resolve())
    const addRecentFile = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ saveAsDialog, writeFile, addRecentFile })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.saveAs() })

    expect(saveAsDialog).toHaveBeenCalledOnce()
    expect(writeFile).toHaveBeenCalledWith('/new/path/file.md', '# Content')
    expect(useEditorStore.getState().path).toBe('/new/path/file.md')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(addRecentFile).toHaveBeenCalledWith('/new/path/file.md')
  })

  it('does nothing when the save dialog is cancelled', async () => {
    const { handle } = makeMockEditor()
    const saveAsDialog = vi.fn(() => Promise.resolve(null as string | null))
    const writeFile = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ saveAsDialog, writeFile })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.saveAs() })

    expect(writeFile).not.toHaveBeenCalled()
    expect(useEditorStore.getState().path).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// newFile()
// ---------------------------------------------------------------------------

describe('useFileOps - newFile()', () => {
  it('clears the editor and resets the store to an untitled blank document when clean', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const setDocumentState = vi.fn()
    const mockLekha = makeMockLekha({ setDocumentState })
    vi.stubGlobal('lekha', mockLekha)

    // Start clean (no dirty flag set).
    useEditorStore.getState().openFile('/old/file.md', '# Old')

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.newFile() })

    expect(setMarkdown).toHaveBeenCalledWith('')
    expect(useEditorStore.getState().path).toBeNull()
    expect(useEditorStore.getState().title).toBe('Untitled')
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(setDocumentState).toHaveBeenCalledWith({
      title: 'Untitled',
      dirty: false,
      path: null,
    })
  })

  it('does NOT call confirmUnsaved when document is clean', async () => {
    const { handle } = makeMockEditor()
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    // Store is clean (fresh reset in beforeEach).

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.newFile() })

    expect(confirmUnsaved).not.toHaveBeenCalled()
  })

  it('adds a new blank tab without prompting, preserving the current dirty doc', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    // Seed a current dirty document tab.
    useDocumentsStore.getState().openDocument({ path: '/file.md', markdown: '# Dirty' })
    useEditorStore.getState().openFile('/file.md', '# Dirty')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.newFile() })

    // With tabs, New never discards the current doc - no prompt.
    expect(confirmUnsaved).not.toHaveBeenCalled()
    // The previous tab is preserved; a new blank Untitled tab is active.
    expect(useDocumentsStore.getState().documents).toHaveLength(2)
    const active = useDocumentsStore.getState().activeDocument()
    expect(active?.path).toBeNull()
    expect(setMarkdown).toHaveBeenCalledWith('')
  })
})

// ---------------------------------------------------------------------------
// openFolder()
// ---------------------------------------------------------------------------

describe('useFileOps - openFolder()', () => {
  it('opens folder dialog, reads directory, and populates workspace store', async () => {
    const { handle } = makeMockEditor()
    const tree: FileNode[] = [
      { name: 'a.md', path: '/proj/a.md', isDirectory: false },
    ]
    const openFolderDialog = vi.fn(() => Promise.resolve('/proj' as string | null))
    const readDir = vi.fn((_d: string) => Promise.resolve(tree))
    const mockLekha = makeMockLekha({ openFolderDialog, readDir })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openFolder() })

    expect(openFolderDialog).toHaveBeenCalledOnce()
    expect(readDir).toHaveBeenCalledWith('/proj')
    expect(useWorkspaceStore.getState().rootFolder).toBe('/proj')
    expect(useWorkspaceStore.getState().fileTree).toEqual(tree)
  })

  it('does nothing when the folder dialog is cancelled', async () => {
    const { handle } = makeMockEditor()
    const openFolderDialog = vi.fn(() => Promise.resolve(null as string | null))
    const readDir = vi.fn((_d: string) => Promise.resolve([] as FileNode[]))
    const mockLekha = makeMockLekha({ openFolderDialog, readDir })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openFolder() })

    expect(readDir).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().rootFolder).toBeNull()
  })

  it('does NOT call setSettings directly (lastFolder persisted via useStartup subscriber)', async () => {
    const { handle } = makeMockEditor()
    const tree: FileNode[] = []
    const openFolderDialog = vi.fn(() => Promise.resolve('/proj' as string | null))
    const readDir = vi.fn((_d: string) => Promise.resolve(tree))
    const setSettings = vi.fn(() => Promise.resolve({ recentFiles: [], lastFolder: null, sidebarVisible: true, sidebarTab: 'files' as const, theme: 'github', focusMode: false, typewriterMode: false, equationNumbering: true, fontSize: 16, autoSave: true, spellCheck: true, spellCheckLanguage: 'en-US', smartPunctuation: true, sidebarWidth: 240, openTabPaths: [], activeTabPath: null, pinnedTabPaths: [], zoomFactor: 1, folderColors: {} }))
    const mockLekha = makeMockLekha({ openFolderDialog, readDir, setSettings })
    vi.stubGlobal('lekha', mockLekha)

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.openFolder() })

    // useFileOps.openFolder must NOT call setSettings - the useStartup
    // subscriber already handles persisting lastFolder when rootFolder changes.
    expect(setSettings).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// guardUnsaved - via open() and newFile()
// ---------------------------------------------------------------------------

describe('useFileOps - guardUnsaved (via open())', () => {
  it('does NOT call confirmUnsaved when document is clean', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# Note'))
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ openFileDialog, readFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    // Store is clean (fresh reset in beforeEach).

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    expect(confirmUnsaved).not.toHaveBeenCalled()
    expect(setMarkdown).toHaveBeenCalledWith('# Note')
  })

  it('opening a file while dirty does NOT prompt (it opens in a new tab)', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# Note'))
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ openFileDialog, readFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    // Seed a current dirty document tab.
    useDocumentsStore.getState().openDocument({ path: '/old.md', markdown: '# Old' })
    useEditorStore.getState().openFile('/old.md', '# Old')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    // No prompt: the dirty doc stays open in its tab; the new file is a new tab.
    expect(confirmUnsaved).not.toHaveBeenCalled()
    expect(readFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setMarkdown).toHaveBeenCalledWith('# Note')
    expect(useDocumentsStore.getState().documents).toHaveLength(2)
    expect(useEditorStore.getState().path).toBe('/docs/note.md')
  })
})

// ---------------------------------------------------------------------------
// closeTab - the save guard now lives here (per-tab close), not on open/new
// ---------------------------------------------------------------------------

describe('useFileOps - closeTab', () => {
  it('closes a clean tab without prompting and activates a neighbour', async () => {
    const { handle } = makeMockEditor()
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: 'A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: 'B' })

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.closeTab(b) })

    expect(confirmUnsaved).not.toHaveBeenCalled()
    expect(useDocumentsStore.getState().documents.map((d) => d.id)).toEqual([a])
    expect(useDocumentsStore.getState().activeId).toBe(a)
  })

  it('prompts and aborts the close when the tab is dirty and user cancels', async () => {
    const { handle } = makeMockEditor()
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: 'A' })
    useEditorStore.getState().openFile('/a.md', 'A')
    useEditorStore.getState().markDirty()
    useDocumentsStore.getState().updateActive({ isDirty: true })

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.closeTab(a) })

    expect(confirmUnsaved).toHaveBeenCalledOnce()
    // Aborted: the tab remains open.
    expect(useDocumentsStore.getState().documents.map((d) => d.id)).toContain(a)
  })

  it('saves then closes when dirty and user picks "Save"', async () => {
    const { handle } = makeMockEditor('A edited')
    const writeFile = vi.fn(() => Promise.resolve())
    const confirmUnsaved = vi.fn(() => Promise.resolve('save' as const))
    const mockLekha = makeMockLekha({ writeFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: 'A' })
    useEditorStore.getState().openFile('/a.md', 'A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.closeTab(a) })

    expect(confirmUnsaved).toHaveBeenCalledOnce()
    expect(writeFile).toHaveBeenCalledWith('/a.md', 'A edited')
    // Last tab closed -> no replacement document; the editor empty state shows.
    const docs = useDocumentsStore.getState()
    expect(docs.documents).toHaveLength(0)
    expect(docs.activeDocument()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Crash-backup integration (snapshotActive / persist / closeTab)
// ---------------------------------------------------------------------------

describe('useFileOps - crash backup', () => {
  it('persist() deletes the linked backup and clears backupId/recovered after save', async () => {
    const { handle } = makeMockEditor('# Saved')
    const deleteBackup = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ deleteBackup })
    vi.stubGlobal('lekha', mockLekha)

    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useDocumentsStore.getState().updateActive({ backupId: 'bk-1', recovered: true, isDirty: true })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.save() })

    expect(deleteBackup).toHaveBeenCalledWith('bk-1')
    const active = useDocumentsStore.getState().activeDocument()!
    expect(active.backupId).toBeNull()
    expect(active.recovered).toBe(false)
    expect(active.isDirty).toBe(false)
  })

  it('persist() does not delete a backup when the tab has none', async () => {
    const { handle } = makeMockEditor('# Saved')
    const deleteBackup = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ deleteBackup })
    vi.stubGlobal('lekha', mockLekha)

    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.save() })

    expect(deleteBackup).not.toHaveBeenCalled()
  })

  it('save still succeeds when deleteBackup throws', async () => {
    const { handle } = makeMockEditor('# Saved')
    const writeFile = vi.fn(() => Promise.resolve())
    const deleteBackup = vi.fn(() => Promise.reject(new Error('EIO')))
    const mockLekha = makeMockLekha({ writeFile, deleteBackup })
    vi.stubGlobal('lekha', mockLekha)

    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useDocumentsStore.getState().updateActive({ backupId: 'bk-1', isDirty: true })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.save() })

    expect(writeFile).toHaveBeenCalledWith('/a.md', '# Saved')
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('selectTab snapshots the outgoing dirty tab as a backup (assigns a backupId)', async () => {
    const { handle } = makeMockEditor('# A edited')
    const writeBackup = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ writeBackup })
    vi.stubGlobal('lekha', mockLekha)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      'uuid-1' as `${string}-${string}-${string}-${string}-${string}`,
    )

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    // Active tab is b; switch to a, dirty it, then switch back to b.
    useDocumentsStore.getState().activateDocument(a)
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.selectTab(b) })

    expect(writeBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        backupId: 'uuid-1',
        path: '/a.md',
        title: 'a.md',
        content: '# A edited',
        eol: 'lf',
      }),
    )
    const tabA = useDocumentsStore.getState().documents.find((d) => d.id === a)!
    expect(tabA.backupId).toBe('uuid-1')

    vi.restoreAllMocks()
  })

  it('closeTab deletes the backup of a discarded ("Don\'t Save") dirty tab', async () => {
    const { handle } = makeMockEditor('# A edited')
    const confirmUnsaved = vi.fn(() => Promise.resolve('dontSave' as const))
    const deleteBackup = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ confirmUnsaved, deleteBackup })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    useDocumentsStore.getState().activateDocument(a)
    useDocumentsStore.getState().updateActive({ backupId: 'bk-1', isDirty: true })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.closeTab(a) })

    expect(confirmUnsaved).toHaveBeenCalledOnce()
    expect(deleteBackup).toHaveBeenCalledWith('bk-1')
    expect(useDocumentsStore.getState().documents.map((d) => d.id)).not.toContain(a)
  })
})

// ---------------------------------------------------------------------------
// syncActivePath - consolidated rename/move/detach path sync
// ---------------------------------------------------------------------------

/** Mount the hook with a mock editor + lekha and return the live FileOps. */
function mountFileOps(overrides: Partial<LekhaAPI> = {}, markdown = '# X') {
  const { handle } = makeMockEditor(markdown)
  const mockLekha = makeMockLekha(overrides)
  vi.stubGlobal('lekha', mockLekha)
  const editorRef = createRef<EditorPaneHandle>()
  ;(editorRef as { current: EditorPaneHandle }).current = handle
  const { result } = renderHook(() => useFileOps(editorRef))
  return { result, mockLekha, handle }
}

describe('useFileOps - syncActivePath', () => {
  it('remaps tab path, updates editor path/title, and re-syncs the OS title (remapFrom)', () => {
    const setDocumentState = vi.fn()
    const { result } = mountFileOps({ setDocumentState })

    const id = useDocumentsStore.getState().openDocument({ path: '/old/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/old/a.md', '# A')

    act(() => { result.current.syncActivePath('/new/b.md', { remapFrom: '/old/a.md' }) })

    expect(useEditorStore.getState().path).toBe('/new/b.md')
    expect(useEditorStore.getState().title).toBe('b.md')
    const tab = useDocumentsStore.getState().documents.find((d) => d.id === id)!
    expect(tab.path).toBe('/new/b.md')
    expect(setDocumentState).toHaveBeenLastCalledWith({
      title: 'b.md',
      dirty: false,
      path: '/new/b.md',
    })
  })

  it('uses the current isDirty for the OS title by default', () => {
    const setDocumentState = vi.fn()
    const { result } = mountFileOps({ setDocumentState })

    useDocumentsStore.getState().openDocument({ path: '/old/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/old/a.md', '# A')
    useEditorStore.getState().markDirty()

    act(() => { result.current.syncActivePath('/new/b.md', { remapFrom: '/old/a.md' }) })

    expect(setDocumentState).toHaveBeenLastCalledWith(
      expect.objectContaining({ dirty: true, path: '/new/b.md' }),
    )
  })

  it('detaches to null path and forces dirty when requested (detach case)', () => {
    const setDocumentState = vi.fn()
    const { result } = mountFileOps({ setDocumentState })

    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useEditorStore.getState().openFile('/a.md', '# A')

    act(() => { result.current.syncActivePath(null, { dirty: true }) })

    expect(useEditorStore.getState().path).toBeNull()
    expect(useEditorStore.getState().title).toBe('Untitled')
    expect(useDocumentsStore.getState().activeDocument()?.path).toBeNull()
    expect(setDocumentState).toHaveBeenLastCalledWith({
      title: 'Untitled',
      dirty: true,
      path: null,
    })
  })
})

// ---------------------------------------------------------------------------
// File-tree ops moved from App (createFileEntry / createFolderEntry /
// renameEntry / deleteEntry / revealEntry)
// ---------------------------------------------------------------------------

describe('useFileOps - file-tree ops', () => {
  it('createFileEntry creates in the resolved dir, refreshes the tree, and opens the file', async () => {
    const createFile = vi.fn(() => Promise.resolve('/proj/Untitled.md'))
    const readFile = vi.fn(() => Promise.resolve(''))
    const readDir = vi.fn(() => Promise.resolve([] as FileNode[]))
    const { result } = mountFileOps({ createFile, readFile, readDir })
    useWorkspaceStore.setState({ rootFolder: '/proj' })

    await act(async () => { await result.current.createFileEntry(null) })

    expect(createFile).toHaveBeenCalledWith('/proj', 'Untitled.md')
    expect(readDir).toHaveBeenCalledWith('/proj')
    expect(useEditorStore.getState().path).toBe('/proj/Untitled.md')
  })

  it('createFileEntry no-ops when no directory can be resolved', async () => {
    const createFile = vi.fn(() => Promise.resolve(''))
    const { result } = mountFileOps({ createFile })
    // rootFolder is null (beforeEach), dir arg null -> nothing to create.

    await act(async () => { await result.current.createFileEntry(null) })

    expect(createFile).not.toHaveBeenCalled()
  })

  it('createFolderEntry creates the folder and refreshes the tree', async () => {
    const createFolder = vi.fn(() => Promise.resolve('/proj/sub/Untitled Folder'))
    const readDir = vi.fn(() => Promise.resolve([] as FileNode[]))
    const { result } = mountFileOps({ createFolder, readDir })
    useWorkspaceStore.setState({ rootFolder: '/proj' })

    await act(async () => { await result.current.createFolderEntry('/proj/sub') })

    expect(createFolder).toHaveBeenCalledWith('/proj/sub', 'Untitled Folder')
    // With a root open, the affected dir is re-read (loadChildren -> readDir).
    expect(readDir).toHaveBeenCalledWith('/proj/sub')
  })

  it('renameEntry remaps the active doc and refreshes the tree', async () => {
    const renamePath = vi.fn(() => Promise.resolve('/proj/renamed.md'))
    const readDir = vi.fn(() => Promise.resolve([] as FileNode[]))
    const setDocumentState = vi.fn()
    const { result } = mountFileOps({ renamePath, readDir, setDocumentState })
    useWorkspaceStore.setState({ rootFolder: '/proj' })

    const id = useDocumentsStore.getState().openDocument({ path: '/proj/old.md', markdown: '# A' })
    useEditorStore.getState().openFile('/proj/old.md', '# A')

    await act(async () => { await result.current.renameEntry('/proj/old.md', 'renamed.md') })

    expect(renamePath).toHaveBeenCalledWith('/proj/old.md', 'renamed.md')
    expect(useEditorStore.getState().path).toBe('/proj/renamed.md')
    const tab = useDocumentsStore.getState().documents.find((d) => d.id === id)!
    expect(tab.path).toBe('/proj/renamed.md')
    expect(readDir).toHaveBeenCalledWith('/proj')
  })

  it('renameEntry leaves the active doc untouched when a different entry is renamed', async () => {
    const renamePath = vi.fn(() => Promise.resolve('/proj/other-renamed.md'))
    const { result } = mountFileOps({ renamePath })

    useDocumentsStore.getState().openDocument({ path: '/proj/active.md', markdown: '# A' })
    useEditorStore.getState().openFile('/proj/active.md', '# A')

    await act(async () => { await result.current.renameEntry('/proj/other.md', 'other-renamed.md') })

    // The active editor path is unchanged (the renamed entry was not active).
    expect(useEditorStore.getState().path).toBe('/proj/active.md')
  })

  it('deleteEntry detaches the open doc when it (or its folder) is trashed', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const deletePath = vi.fn(() => Promise.resolve())
    const setDocumentState = vi.fn()
    const { result } = mountFileOps({ deletePath, setDocumentState })

    useDocumentsStore.getState().openDocument({ path: '/proj/folder/note.md', markdown: '# A' })
    useEditorStore.getState().openFile('/proj/folder/note.md', '# A')

    // Trash the containing folder; the open doc sits under it -> detach.
    await act(async () => { await result.current.deleteEntry('/proj/folder') })

    expect(deletePath).toHaveBeenCalledWith('/proj/folder')
    expect(useEditorStore.getState().path).toBeNull()
  })

  it('deleteEntry does nothing when the confirm is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    const deletePath = vi.fn(() => Promise.resolve())
    const { result } = mountFileOps({ deletePath })

    await act(async () => { await result.current.deleteEntry('/proj/x.md') })

    expect(deletePath).not.toHaveBeenCalled()
  })

  it('revealEntry forwards to the bridge', () => {
    const revealPath = vi.fn(() => Promise.resolve())
    const { result } = mountFileOps({ revealPath })

    act(() => { result.current.revealEntry('/proj/x.md') })

    expect(revealPath).toHaveBeenCalledWith('/proj/x.md')
  })
})

// ---------------------------------------------------------------------------
// saveAllForClose / discardAllForClose - window-level close-guard handlers.
// These act on EVERY dirty tab, not just the active one.
// ---------------------------------------------------------------------------

describe('useFileOps - saveAllForClose', () => {
  it('writes EVERY dirty tab with a path and marks them all clean', async () => {
    const { handle } = makeMockEditor('# active edited')
    const writeFile = vi.fn((_path: string, _content: string) => Promise.resolve())
    const mockLekha = makeMockLekha({ writeFile })
    vi.stubGlobal('lekha', mockLekha)

    // Two tabs, both dirty, both with paths. Tab a is active (its live content
    // is folded in via snapshotActive); tab b is a dirty background tab.
    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B edited' })
    useDocumentsStore.getState().updateDocument(b, { isDirty: true })
    // Make a the active tab and mark it dirty in both stores.
    useDocumentsStore.getState().activateDocument(a)
    useDocumentsStore.getState().updateDocument(a, { isDirty: true })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.saveAllForClose() })

    // Both paths were written (the active tab's snapshot picks up the live editor
    // content via snapshotActive).
    const written = writeFile.mock.calls.map((c) => c[0])
    expect(written).toContain('/a.md')
    expect(written).toContain('/b.md')
    // Both tabs are now clean.
    const docs = useDocumentsStore.getState().documents
    expect(docs.find((d) => d.id === a)?.isDirty).toBe(false)
    expect(docs.find((d) => d.id === b)?.isDirty).toBe(false)
    // The live editor dirty flag is cleared too (active tab was saved).
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('aborts and keeps the offending tab dirty when a write fails', async () => {
    const { handle } = makeMockEditor('# A')
    const writeFile = vi.fn(() => Promise.reject(new Error('EACCES')))
    vi.stubGlobal('lekha', makeMockLekha({ writeFile }))
    vi.stubGlobal('alert', vi.fn())

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    useDocumentsStore.getState().activateDocument(a)
    useDocumentsStore.getState().updateDocument(a, { isDirty: true })
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.saveAllForClose() })

    // The write failed -> the tab stays dirty so the window stays open.
    expect(useDocumentsStore.getState().documents.find((d) => d.id === a)?.isDirty).toBe(true)
  })
})

describe('useFileOps - discardAllForClose', () => {
  it('deletes every tab backup, marks all clean, and writes NO file', async () => {
    const { handle } = makeMockEditor('# A')
    const writeFile = vi.fn(() => Promise.resolve())
    const deleteBackup = vi.fn(() => Promise.resolve())
    vi.stubGlobal('lekha', makeMockLekha({ writeFile, deleteBackup }))

    // Two dirty tabs, each with a linked crash backup.
    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    useDocumentsStore.getState().updateDocument(a, { isDirty: true, backupId: 'bk-a' })
    useDocumentsStore.getState().updateDocument(b, { isDirty: true, backupId: 'bk-b' })
    useEditorStore.getState().openFile('/b.md', '# B')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.discardAllForClose() })

    // Both backups were deleted.
    expect(deleteBackup).toHaveBeenCalledWith('bk-a')
    expect(deleteBackup).toHaveBeenCalledWith('bk-b')
    // All tabs are clean with their backup state cleared.
    for (const d of useDocumentsStore.getState().documents) {
      expect(d.isDirty).toBe(false)
      expect(d.backupId).toBeNull()
      expect(d.recovered).toBe(false)
    }
    // The live editor is clean too, and NO file was written (discard, not save).
    expect(useEditorStore.getState().isDirty).toBe(false)
    expect(writeFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// closeTab race guard (item 3): an active-doc change during the unsaved dialog
// must abort the close so it never acts on a stale active doc.
// ---------------------------------------------------------------------------

describe('useFileOps - closeTab race guard', () => {
  it('aborts the close when the active doc changes while the unsaved dialog is open', async () => {
    const { handle } = makeMockEditor('A edited')
    // The confirm dialog resolves only after we have switched the active tab,
    // simulating the user sitting on the dialog while another path activates a
    // different document.
    let resolveConfirm: ((c: 'save' | 'dontSave' | 'cancel') => void) | null = null
    const confirmUnsaved = vi.fn(
      () =>
        new Promise<'save' | 'dontSave' | 'cancel'>((res) => {
          resolveConfirm = res
        }),
    )
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: 'A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: 'B' })
    // Make tab a the active, dirty target of the close.
    useDocumentsStore.getState().activateDocument(a)
    useEditorStore.getState().openFile('/a.md', 'A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))

    // Kick off the close (dialog opens and blocks on resolveConfirm).
    let closePromise: Promise<void>
    await act(async () => {
      closePromise = result.current.closeTab(a)
      // Wait a tick so closeTab reaches the awaited confirm dialog.
      await Promise.resolve()
    })

    // Interleave: another path switches the active document to b while the
    // dialog is open. Answer the dialog with "dontSave" so the guard returns
    // true (it would otherwise proceed straight to closing the stale target).
    await act(async () => {
      useDocumentsStore.getState().activateDocument(b)
      resolveConfirm?.('dontSave')
      await closePromise
    })

    // The close was aborted because the active doc changed mid-dialog: tab a is
    // still open and the active selection (b) is left intact - the guard's
    // answer applied to a no-longer-active tab, so closeTab does not act on it.
    expect(useDocumentsStore.getState().documents.map((d) => d.id)).toContain(a)
    expect(useDocumentsStore.getState().activeId).toBe(b)
  })

  it('still closes normally when no interleaving occurs', async () => {
    const { handle } = makeMockEditor('A edited')
    const confirmUnsaved = vi.fn(() => Promise.resolve('save' as const))
    const writeFile = vi.fn(() => Promise.resolve())
    const mockLekha = makeMockLekha({ confirmUnsaved, writeFile })
    vi.stubGlobal('lekha', mockLekha)

    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: 'A' })
    useDocumentsStore.getState().activateDocument(a)
    useEditorStore.getState().openFile('/a.md', 'A')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.closeTab(a) })

    // Normal path: dirty tab saved and closed (last tab -> blank Untitled).
    expect(writeFile).toHaveBeenCalledWith('/a.md', 'A edited')
    expect(useDocumentsStore.getState().documents.map((d) => d.id)).not.toContain(a)
  })
})

// ---------------------------------------------------------------------------
// Error surfacing - move/revert/duplicate/open-folder
// ---------------------------------------------------------------------------

describe('useFileOps - error surfacing on failed ops', () => {
  function setupWithOpenDoc(overrides: Partial<LekhaAPI>) {
    const { handle } = makeMockEditor('# Doc')
    vi.stubGlobal('lekha', makeMockLekha(overrides))
    const alert = vi.fn()
    vi.stubGlobal('alert', alert)
    useEditorStore.getState().openFile('/docs/note.md', '# Doc')
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))
    return { result, alert }
  }

  it('moveCurrentTo alerts when movePath rejects and keeps the current path', async () => {
    const { result, alert } = setupWithOpenDoc({
      openFolderDialog: vi.fn(() => Promise.resolve('/dest' as string | null)),
      movePath: vi.fn(() => Promise.reject(new Error('already exists'))),
    })
    await act(async () => { await result.current.moveCurrentTo() })
    expect(alert).toHaveBeenCalledOnce()
    expect(String(alert.mock.calls[0]?.[0])).toContain('already exists')
    expect(useEditorStore.getState().path).toBe('/docs/note.md')
  })

  it('revertToSaved alerts when readFile rejects and keeps the buffer', async () => {
    const { result, alert } = setupWithOpenDoc({
      readFile: vi.fn(() => Promise.reject(new Error('EACCES: permission denied'))),
    })
    await act(async () => { await result.current.revertToSaved() })
    expect(alert).toHaveBeenCalledOnce()
    expect(String(alert.mock.calls[0]?.[0])).toContain('EACCES')
  })

  it('duplicateCurrent alerts when duplicatePath rejects', async () => {
    const { result, alert } = setupWithOpenDoc({
      duplicatePath: vi.fn(() => Promise.reject(new Error('disk full'))),
    })
    await act(async () => { await result.current.duplicateCurrent() })
    expect(alert).toHaveBeenCalledOnce()
    expect(String(alert.mock.calls[0]?.[0])).toContain('disk full')
  })

  it('openFolderPath alerts when readDir rejects and leaves the workspace root unset', async () => {
    const { result, alert } = setupWithOpenDoc({
      readDir: vi.fn(() => Promise.reject(new Error('ENOENT: no such directory'))),
    })
    await act(async () => { await result.current.openFolderPath('/gone') })
    expect(alert).toHaveBeenCalledOnce()
    expect(String(alert.mock.calls[0]?.[0])).toContain('ENOENT')
    expect(useWorkspaceStore.getState().rootFolder).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// External-change baseline (diskSig) refresh
// ---------------------------------------------------------------------------

describe('useFileOps - diskSig refresh after non-persist writes', () => {
  function setupStatable() {
    const { handle } = makeMockEditor('# Edited')
    // Disk mtime starts at 1 and bumps on every write (and via bumpDisk for
    // external edits), mimicking a real filesystem so a stale baseline is
    // detectable.
    let mtime = 1
    const statFile = vi.fn(() =>
      Promise.resolve({ sizeBytes: 10, birthtimeMs: 0, mtimeMs: mtime, inode: 7 }),
    )
    const writeFile = vi.fn(() => { mtime += 1; return Promise.resolve() })
    const readFile = vi.fn(() => Promise.resolve('# A'))
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('lekha', makeMockLekha({ statFile, writeFile, readFile }))
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))
    const bumpDisk = () => { mtime += 1 }
    return { result, writeFile, confirm, bumpDisk }
  }

  it('saveAllForClose refreshes the baseline so a later Save does not falsely prompt', async () => {
    const { result, writeFile, confirm } = setupStatable()
    await act(async () => { await result.current.openPath('/a.md') }) // baseline mtime=1
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.saveAllForClose() }) // write bumps disk to mtime=2

    // Close was cancelled, user edits and saves again: the baseline must match
    // what saveAllForClose wrote, so no "changed on disk" confirm appears.
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })

    expect(confirm).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledTimes(2)
  })

  it('refreshDiskSig adopts the current on-disk state as the new baseline', async () => {
    const { result, writeFile, confirm, bumpDisk } = setupStatable()
    await act(async () => { await result.current.openPath('/a.md') }) // baseline mtime=1
    // Simulate an external write the app already reconciled (folder replace
    // reloaded the buffer from disk), then the baseline refresh that must
    // accompany it.
    bumpDisk()
    await act(async () => { await result.current.refreshDiskSig('/a.md') })

    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })
    expect(confirm).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// saveQuiet (auto-save path)
// ---------------------------------------------------------------------------

describe('useFileOps - saveQuiet', () => {
  function setupConflict(opts: { conflict: boolean }) {
    const { handle } = makeMockEditor('# Edited')
    let mtime = 1
    const statFile = vi.fn(() =>
      Promise.resolve({ sizeBytes: 10, birthtimeMs: 0, mtimeMs: mtime, inode: 7 }),
    )
    const writeFile = vi.fn(() => { mtime += 1; return Promise.resolve() })
    const readFile = vi.fn(() => Promise.resolve('# A'))
    const confirm = vi.fn(() => true)
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('lekha', makeMockLekha({ statFile, writeFile, readFile }))
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))
    const externalEdit = () => { mtime += 1 }
    return { result, writeFile, confirm, externalEdit, conflict: opts.conflict }
  }

  it('on an external-edit conflict: skips the write, stays dirty, reports via onConflict, never confirms', async () => {
    const { result, writeFile, confirm, externalEdit } = setupConflict({ conflict: true })
    await act(async () => { await result.current.openPath('/a.md') })
    useEditorStore.getState().markDirty()
    externalEdit() // disk changed since open

    const onConflict = vi.fn()
    await act(async () => { await result.current.saveQuiet(onConflict) })

    expect(confirm).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
    expect(onConflict).toHaveBeenCalledOnce()
    expect(useEditorStore.getState().isDirty).toBe(true)
  })

  it('without a conflict: writes and marks clean like a normal save', async () => {
    const { result, writeFile, confirm } = setupConflict({ conflict: false })
    await act(async () => { await result.current.openPath('/a.md') })
    useEditorStore.getState().markDirty()

    const onConflict = vi.fn()
    await act(async () => { await result.current.saveQuiet(onConflict) })

    expect(confirm).not.toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledOnce()
    expect(onConflict).not.toHaveBeenCalled()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('is a no-op for clean or path-less documents', async () => {
    const { result, writeFile } = setupConflict({ conflict: false })
    const onConflict = vi.fn()
    // No document open at all (path null).
    await act(async () => { await result.current.saveQuiet(onConflict) })
    // Open but clean.
    await act(async () => { await result.current.openPath('/a.md') })
    await act(async () => { await result.current.saveQuiet(onConflict) })
    expect(writeFile).not.toHaveBeenCalled()
    expect(onConflict).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// restoreTabs (session restore)
// ---------------------------------------------------------------------------

describe('useFileOps - restoreTabs', () => {
  function setupRestore(files: Record<string, string>) {
    const { handle, setMarkdown } = makeMockEditor()
    const readFile = vi.fn((p: string) =>
      p in files ? Promise.resolve(files[p]!) : Promise.reject(new Error('ENOENT')),
    )
    const statFile = vi.fn(() =>
      Promise.resolve({ sizeBytes: 5, birthtimeMs: 0, mtimeMs: 7, inode: 42 }),
    )
    vi.stubGlobal('lekha', makeMockLekha({ readFile, statFile }))
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))
    return { result, setMarkdown, readFile, statFile }
  }

  it('creates every tab in one batch but loads ONLY the active one into the editor', async () => {
    const { result, setMarkdown } = setupRestore({
      '/a.md': '# A',
      '/b.md': '# B',
      '/c.md': '# C',
    })
    await act(async () => {
      await result.current.restoreTabs(['/a.md', '/b.md', '/c.md'], '/b.md')
    })

    const docs = useDocumentsStore.getState().documents
    expect(docs.map((d) => d.path)).toEqual(['/a.md', '/b.md', '/c.md'])
    expect(useDocumentsStore.getState().activeDocument()?.path).toBe('/b.md')
    // The startup glitch was N sequential editor loads: only the active tab
    // may touch the live editor.
    expect(setMarkdown).toHaveBeenCalledTimes(1)
    expect(setMarkdown).toHaveBeenCalledWith('# B')
  })

  it('reuses the initial blank Untitled tab for the first file (no stray welcome tab)', async () => {
    useDocumentsStore.getState().openDocument({ path: null, markdown: '' })
    const { result } = setupRestore({ '/a.md': '# A', '/b.md': '# B' })
    await act(async () => {
      await result.current.restoreTabs(['/a.md', '/b.md'], null)
    })
    const docs = useDocumentsStore.getState().documents
    expect(docs.map((d) => d.path)).toEqual(['/a.md', '/b.md'])
    expect(docs.some((d) => d.path === null)).toBe(false)
  })

  it('skips missing files and falls back to the LAST restored tab when activePath is gone', async () => {
    const { result, setMarkdown } = setupRestore({ '/a.md': '# A', '/c.md': '# C' })
    await act(async () => {
      await result.current.restoreTabs(['/a.md', '/gone.md', '/c.md'], '/gone.md')
    })
    const docs = useDocumentsStore.getState().documents
    expect(docs.map((d) => d.path)).toEqual(['/a.md', '/c.md'])
    expect(useDocumentsStore.getState().activeDocument()?.path).toBe('/c.md')
    expect(setMarkdown).toHaveBeenCalledWith('# C')
  })

  it('restores nothing (welcome stays) when no persisted file is readable', async () => {
    const { result, setMarkdown } = setupRestore({})
    await act(async () => {
      await result.current.restoreTabs(['/gone1.md', '/gone2.md'], '/gone1.md')
    })
    expect(useDocumentsStore.getState().documents).toHaveLength(0)
    expect(setMarkdown).not.toHaveBeenCalled()
  })

  it('seeds the inode and external-edit baseline for EVERY restored tab', async () => {
    const { result, statFile } = setupRestore({ '/a.md': '# A', '/b.md': '# B' })
    await act(async () => {
      await result.current.restoreTabs(['/a.md', '/b.md'], '/a.md')
    })
    expect(statFile).toHaveBeenCalledTimes(2)
    for (const d of useDocumentsStore.getState().documents) {
      expect(d.inode).toBe(42)
    }
    // The active editor's inode is synced too (rename recovery needs it).
    expect(useEditorStore.getState().inode).toBe(42)
  })

  it('saving a restored tab does not falsely prompt about external changes', async () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('confirm', confirm)
    const { result } = setupRestore({ '/a.md': '# A' })
    await act(async () => {
      await result.current.restoreTabs(['/a.md'], '/a.md')
    })
    useEditorStore.getState().markDirty()
    await act(async () => { await result.current.save() })
    // The baseline seeded at restore time matches the unchanged disk: no
    // confirm, and the write went through.
    expect(confirm).not.toHaveBeenCalled()
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('de-dupes repeated persisted paths into a single tab', async () => {
    const { result } = setupRestore({ '/a.md': '# A' })
    await act(async () => {
      await result.current.restoreTabs(['/a.md', '/a.md'], '/a.md')
    })
    expect(useDocumentsStore.getState().documents).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Bulk tab closes (tab context menu)
// ---------------------------------------------------------------------------

describe('useFileOps - bulk tab closes', () => {
  function setupTabs(opts?: { confirmChoice?: 'save' | 'dontSave' | 'cancel' }) {
    const { handle, setMarkdown } = makeMockEditor('# Active')
    const confirmUnsaved = vi.fn(() => Promise.resolve(opts?.confirmChoice ?? 'cancel'))
    vi.stubGlobal('lekha', makeMockLekha({ confirmUnsaved }))
    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    const c = useDocumentsStore.getState().openDocument({ path: '/c.md', markdown: '# C' })
    useDocumentsStore.getState().activateDocument(b)
    useEditorStore.getState().openFile('/b.md', '# B')
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))
    return { result, ids: { a, b, c }, setMarkdown, confirmUnsaved }
  }

  it('closeOtherTabs keeps the target and never flips the editor through clean background tabs', async () => {
    const { result, ids, setMarkdown } = setupTabs()
    await act(async () => { await result.current.closeOtherTabs(ids.b) })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/b.md'])
    expect(useDocumentsStore.getState().activeDocument()?.path).toBe('/b.md')
    // Clean background tabs closed IN PLACE - the live editor was untouched.
    expect(setMarkdown).not.toHaveBeenCalled()
  })

  it('closeTabsToRight closes only tabs after the target, in strip order', async () => {
    const { result, ids } = setupTabs()
    await act(async () => { await result.current.closeTabsToRight(ids.a) })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/a.md'])
  })

  it('closeSavedTabs keeps dirty tabs open', async () => {
    const { result, ids } = setupTabs()
    useDocumentsStore.getState().updateDocument(ids.a, { isDirty: true })
    await act(async () => { await result.current.closeSavedTabs() })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/a.md'])
  })

  it('a cancelled save guard aborts the REMAINING closes (VS Code semantics)', async () => {
    const { result, ids, confirmUnsaved } = setupTabs({ confirmChoice: 'cancel' })
    // Make the FIRST other tab dirty so its guard runs (and is cancelled).
    useDocumentsStore.getState().updateDocument(ids.a, { isDirty: true })
    await act(async () => { await result.current.closeOtherTabs(ids.b) })
    expect(confirmUnsaved).toHaveBeenCalled()
    // Nothing was closed: the dirty tab survived its cancelled guard, and the
    // remaining close (/c.md) was aborted.
    expect(useDocumentsStore.getState().documents).toHaveLength(3)
  })

  it('closeAllTabs with clean tabs ends on the editor empty state', async () => {
    const { result } = setupTabs()
    await act(async () => { await result.current.closeAllTabs() })
    expect(useDocumentsStore.getState().documents).toHaveLength(0)
  })
})

describe('useFileOps - bulk closes skip pinned tabs', () => {
  it('Close Others / Close Saved / Close All all keep pinned tabs open', async () => {
    const { handle } = makeMockEditor('# B')
    vi.stubGlobal('lekha', makeMockLekha({}))
    const a = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const b = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    useDocumentsStore.getState().openDocument({ path: '/c.md', markdown: '# C' })
    useDocumentsStore.getState().setPinned(a, true)
    useDocumentsStore.getState().activateDocument(b)
    useEditorStore.getState().openFile('/b.md', '# B')
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => { await result.current.closeOtherTabs(b) })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/a.md', '/b.md'])

    await act(async () => { await result.current.closeSavedTabs() })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/a.md'])

    await act(async () => { await result.current.closeAllTabs() })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual(['/a.md'])
  })
})

describe('useFileOps - restoreTabs re-pins persisted pinned tabs', () => {
  it('applies pinnedPaths in order, regrouped at the front of the strip', async () => {
    const { handle } = makeMockEditor()
    const readFile = vi.fn((p: string) => Promise.resolve(`# ${p}`))
    vi.stubGlobal('lekha', makeMockLekha({ readFile }))
    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle
    const { result } = renderHook(() => useFileOps(editorRef))

    await act(async () => {
      await result.current.restoreTabs(
        ['/a.md', '/b.md', '/c.md'],
        '/b.md',
        ['/c.md', '/a.md'], // persisted pin order
      )
    })
    expect(useDocumentsStore.getState().documents.map((d) => `${d.path}${d.isPinned ? '*' : ''}`))
      .toEqual(['/c.md*', '/a.md*', '/b.md'])
    expect(useDocumentsStore.getState().activeDocument()?.path).toBe('/b.md')
  })
})

describe('useFileOps - lazy tree', () => {
  it('loadChildren reads a directory and patches that node in the store', async () => {
    const subKids: FileNode[] = [
      { name: 'nested.md', path: '/proj/sub/nested.md', isDirectory: false },
    ]
    const readDir = vi.fn((d: string) =>
      Promise.resolve(d === '/proj/sub' ? subKids : ([] as FileNode[])),
    )
    useWorkspaceStore.setState({
      rootFolder: '/proj',
      fileTree: [{ name: 'sub', path: '/proj/sub', isDirectory: true }],
    })
    const { result } = mountFileOps({ readDir })

    await act(async () => {
      await result.current.loadChildren('/proj/sub')
    })

    expect(readDir).toHaveBeenCalledWith('/proj/sub')
    const sub = useWorkspaceStore.getState().fileTree.find((n) => n.path === '/proj/sub')!
    expect(sub.children).toEqual(subKids)
  })

  it('loadChildren is single-flight per dir: a stale read does not overwrite a fresher one', async () => {
    // Two reads of /proj/sub; the FIRST resolves LAST with stale contents.
    const deferreds: Array<(v: FileNode[]) => void> = []
    const readDir = vi.fn(
      (_d: string) => new Promise<FileNode[]>((res) => { deferreds.push(res) }),
    )
    useWorkspaceStore.setState({
      rootFolder: '/proj',
      fileTree: [{ name: 'sub', path: '/proj/sub', isDirectory: true }],
    })
    const { result } = mountFileOps({ readDir })

    let p1!: Promise<void>
    let p2!: Promise<void>
    await act(async () => {
      p1 = result.current.loadChildren('/proj/sub') // gen 1 (stale)
      p2 = result.current.loadChildren('/proj/sub') // gen 2 (fresh, latest)
      // resolve the FRESH (2nd) read first, then the STALE (1st) read.
      deferreds[1]!([{ name: 'fresh.md', path: '/proj/sub/fresh.md', isDirectory: false }])
      deferreds[0]!([{ name: 'stale.md', path: '/proj/sub/stale.md', isDirectory: false }])
      await Promise.all([p1, p2])
    })

    const sub = useWorkspaceStore.getState().fileTree.find((n) => n.path === '/proj/sub')!
    // The fresh read wins; the stale read was dropped.
    expect(sub.children).toEqual([{ name: 'fresh.md', path: '/proj/sub/fresh.md', isDirectory: false }])
  })

  it('revealPath loads the ancestor chain of a file top-down', async () => {
    const calls: string[] = []
    const readDir = vi.fn((d: string) => {
      calls.push(d)
      if (d === '/proj/a') {
        return Promise.resolve([{ name: 'b', path: '/proj/a/b', isDirectory: true }] as FileNode[])
      }
      if (d === '/proj/a/b') {
        return Promise.resolve([
          { name: 'deep.md', path: '/proj/a/b/deep.md', isDirectory: false },
        ] as FileNode[])
      }
      return Promise.resolve([] as FileNode[])
    })
    useWorkspaceStore.setState({
      rootFolder: '/proj',
      fileTree: [{ name: 'a', path: '/proj/a', isDirectory: true }],
    })
    const { result } = mountFileOps({ readDir })

    await act(async () => {
      await result.current.revealPath('/proj/a/b/deep.md')
    })

    expect(calls).toEqual(['/proj/a', '/proj/a/b'])
    expect(loadedDirPaths(useWorkspaceStore.getState().fileTree)).toContain('/proj/a/b')
  })
})
