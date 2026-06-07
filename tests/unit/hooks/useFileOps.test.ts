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
    readFile: vi.fn((_p: string) => Promise.resolve('# Loaded')),
    statFile: vi.fn(() => Promise.resolve({ sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0, inode: 0 })),
    getPathForFile: vi.fn(() => ''),
    verifyOpenFile: vi.fn(() => Promise.resolve({ status: 'present' as const })),
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([] as FileNode[])),
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
        activeTabPath: null,
      }),
    ),
    getRecentFiles: vi.fn(() => Promise.resolve([] as string[])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    newWindow: vi.fn(),
    print: vi.fn(),
    share: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    onCommand: vi.fn(() => () => undefined),
    onOpenPath: vi.fn(() => () => undefined),
    takePendingOpen: vi.fn(() => Promise.resolve([])),
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
    const setSettings = vi.fn(() => Promise.resolve({ recentFiles: [], lastFolder: null, sidebarVisible: true, sidebarTab: 'files' as const, theme: 'github', focusMode: false, typewriterMode: false, equationNumbering: true, fontSize: 16, autoSave: true, spellCheck: true, spellCheckLanguage: 'en-US', smartPunctuation: true, sidebarWidth: 240, openTabPaths: [], activeTabPath: null }))
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
    // Last tab closed -> a fresh blank Untitled takes its place.
    const docs = useDocumentsStore.getState()
    expect(docs.documents).toHaveLength(1)
    expect(docs.activeDocument()?.path).toBeNull()
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
    const createFolder = vi.fn(() => Promise.resolve('/proj/Untitled Folder'))
    const readDir = vi.fn(() => Promise.resolve([] as FileNode[]))
    const { result } = mountFileOps({ createFolder, readDir })

    await act(async () => { await result.current.createFolderEntry('/proj/sub') })

    expect(createFolder).toHaveBeenCalledWith('/proj/sub', 'Untitled Folder')
    expect(readDir).not.toHaveBeenCalled() // no root open -> refreshTree no-ops
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
