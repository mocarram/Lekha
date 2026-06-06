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
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([] as FileNode[])),
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
      }),
    ),
    getRecentFiles: vi.fn(() => Promise.resolve([] as string[])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    newWindow: vi.fn(),
    onCommand: vi.fn(() => () => undefined),
    onOpenPath: vi.fn(() => () => undefined),
    onSetTheme: vi.fn(() => () => undefined),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportPandoc: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
    saveImage: vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' })),
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
    searchFolder: vi.fn(() => Promise.resolve([])),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  useEditorStore.getState().reset()
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

  it('aborts when dirty and user cancels', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/file.md', '# Dirty')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.newFile() })

    // Should NOT have cleared the editor.
    expect(setMarkdown).not.toHaveBeenCalled()
    expect(useEditorStore.getState().path).toBe('/file.md')
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
    const setSettings = vi.fn(() => Promise.resolve({ recentFiles: [], lastFolder: null, sidebarVisible: true, sidebarTab: 'files' as const, theme: 'github', focusMode: false, typewriterMode: false, equationNumbering: true, fontSize: 16, autoSave: true, spellCheck: true, spellCheckLanguage: 'en-US' }))
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

  it('proceeds and discards when dirty and user picks "Don\'t Save"', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# Note'))
    const confirmUnsaved = vi.fn(() => Promise.resolve('dontSave' as const))
    const mockLekha = makeMockLekha({ openFileDialog, readFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/old.md', '# Old')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    expect(confirmUnsaved).toHaveBeenCalledOnce()
    expect(readFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setMarkdown).toHaveBeenCalledWith('# Note')
    expect(useEditorStore.getState().path).toBe('/docs/note.md')
  })

  it('aborts when dirty and user picks "Cancel"', async () => {
    const { handle, setMarkdown } = makeMockEditor()
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# Note'))
    const confirmUnsaved = vi.fn(() => Promise.resolve('cancel' as const))
    const mockLekha = makeMockLekha({ openFileDialog, readFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/old.md', '# Old')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    expect(confirmUnsaved).toHaveBeenCalledOnce()
    // readFile must NOT be called - the operation was aborted.
    expect(readFile).not.toHaveBeenCalled()
    expect(setMarkdown).not.toHaveBeenCalled()
    // Store path must remain unchanged.
    expect(useEditorStore.getState().path).toBe('/old.md')
  })

  it('saves and then proceeds when dirty and user picks "Save"', async () => {
    const { handle, setMarkdown } = makeMockEditor('# Old')
    const openFileDialog = vi.fn(() => Promise.resolve('/docs/note.md' as string | null))
    const readFile = vi.fn((_p: string) => Promise.resolve('# New'))
    const writeFile = vi.fn(() => Promise.resolve())
    const confirmUnsaved = vi.fn(() => Promise.resolve('save' as const))
    const mockLekha = makeMockLekha({ openFileDialog, readFile, writeFile, confirmUnsaved })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/old.md', '# Old')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    await act(async () => { await result.current.open() })

    // The save must have been called (writeFile).
    expect(writeFile).toHaveBeenCalledWith('/old.md', '# Old')
    // And then the open proceeded.
    expect(readFile).toHaveBeenCalledWith('/docs/note.md')
    expect(setMarkdown).toHaveBeenCalledWith('# New')
  })
})
