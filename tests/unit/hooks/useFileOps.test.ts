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
  const toggleMode = vi.fn()
  const focus = vi.fn()
  const handle: EditorPaneHandle = { getMarkdown, setMarkdown, getMode, toggleMode, focus }
  return { handle, setMarkdown, getMarkdown }
}

/** Build a mock LekhaAPI with sensible defaults. */
function makeMockLekha(overrides: Partial<LekhaAPI> = {}): LekhaAPI {
  return {
    openFileDialog: vi.fn(() => Promise.resolve(null as string | null)),
    openFolderDialog: vi.fn(() => Promise.resolve(null as string | null)),
    saveAsDialog: vi.fn(() => Promise.resolve(null as string | null)),
    readFile: vi.fn((_p: string) => Promise.resolve('# Loaded')),
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([] as FileNode[])),
    getSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
      }),
    ),
    setSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
      }),
    ),
    getRecentFiles: vi.fn(() => Promise.resolve([] as string[])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    onCommand: vi.fn(() => () => undefined),
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
  it('clears the editor and resets the store to an untitled blank document', () => {
    const { handle, setMarkdown } = makeMockEditor()
    const setDocumentState = vi.fn()
    const mockLekha = makeMockLekha({ setDocumentState })
    vi.stubGlobal('lekha', mockLekha)

    useEditorStore.getState().openFile('/old/file.md', '# Old')
    useEditorStore.getState().markDirty()

    const editorRef = createRef<EditorPaneHandle>()
    ;(editorRef as { current: EditorPaneHandle }).current = handle

    const { result } = renderHook(() => useFileOps(editorRef))
    act(() => { result.current.newFile() })

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
})
