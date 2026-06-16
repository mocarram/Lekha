/**
 * Unit tests for the crash-recovery step inside useStartup.
 *
 * After the openTabPaths restore loop, useStartup lists crash backups and:
 *   - drops a stale backup (on-disk content already equals the backup),
 *   - restores a changed backup as a dirty + recovered tab,
 *   - dedupes by path (replaces the buffer of an already-restored tab),
 *   - restores an Untitled (path null) backup as a path-less dirty tab.
 *
 * window.lekha (listBackups / readFile / deleteBackup / getSettings / ...) is
 * stubbed; fileOps is a minimal mock; the editor handle is a stub whose
 * setMarkdown is asserted to receive the recovered buffer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { useStartup } from '../../../src/renderer/hooks/useStartup'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type { FileOps } from '../../../src/renderer/hooks/useFileOps'
import type { EditorPaneHandle } from '../../../src/renderer/editor/EditorPane'
import type { Settings, BackupRecord } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    recentFiles: [],
    lastFolder: null,
    sidebarVisible: true,
    sidebarTab: 'files',
    theme: 'github',
    focusMode: false,
    typewriterMode: false,
    equationNumbering: true,
    fontSize: 16,
    autoSave: false,
    spellCheck: true,
    spellCheckLanguage: 'en-US',
    smartPunctuation: true,
    sidebarWidth: 240,
    openTabPaths: [],
    pinnedTabPaths: [],    zoomFactor: 1,
    folderColors: {},
    activeTabPath: null,
    ...overrides,
  }
}

function backup(overrides: Partial<BackupRecord> = {}): BackupRecord {
  return {
    backupId: 'b-1',
    path: '/a.md',
    title: 'a.md',
    content: '# recovered',
    eol: 'lf',
    savedAt: 1,
    ...overrides,
  }
}

function makeEditorRef() {
  const setMarkdown = vi.fn()
  const handle = { setMarkdown } as unknown as EditorPaneHandle
  const ref = createRef<EditorPaneHandle>()
  ;(ref as { current: EditorPaneHandle }).current = handle
  return { ref, setMarkdown }
}

/**
 * A fileOps mock whose openPath actually opens a tab in the documentsStore
 * (mirroring the real restore) so dedupe-by-path can be exercised.
 */
function makeFileOps(readFile: (p: string) => Promise<string>): FileOps {
  const openPath = vi.fn(async (p: string) => {
    const md = await readFile(p)
    useDocumentsStore.getState().openDocument({ path: p, markdown: md })
  })
  // Mirrors the real restoreTabs closely enough for the recovery tests:
  // opens each restorable path as a tab, then activates the remembered one.
  const restoreTabs = vi.fn(async (paths: string[], activePath: string | null) => {
    for (const p of paths) {
      try {
        const md = await readFile(p)
        useDocumentsStore.getState().openDocument({ path: p, markdown: md })
      } catch {
        // skipped, like the real implementation
      }
    }
    if (activePath !== null) {
      const tab = useDocumentsStore.getState().documents.find((d) => d.path === activePath)
      if (tab) useDocumentsStore.getState().activateDocument(tab.id)
    }
  })
  const selectTab = vi.fn(() => Promise.resolve())
  const noop = vi.fn(() => Promise.resolve())
  return {
    open: noop,
    openPath,
    restoreTabs,
    save: noop,
    saveAs: noop,
    newFile: noop,
    openFolder: noop,
    openFolderPath: noop,
    refreshTree: noop,
    refreshDiskSig: noop,
    saveQuiet: noop,
    guardUnsaved: vi.fn(() => Promise.resolve(true)),
    revertToSaved: noop,
    duplicateCurrent: noop,
    deleteCurrent: noop,
    moveCurrentTo: noop,
    selectTab,
    closeTab: noop,
    closeOtherTabs: noop,
    closeTabsToRight: noop,
    closeSavedTabs: noop,
    closeAllTabs: noop,
    saveAllForClose: noop,
    discardAllForClose: noop,
    syncActivePath: vi.fn(),
    createFileEntry: noop,
    createFolderEntry: noop,
    renameEntry: noop,
    deleteEntry: noop,
    revealEntry: vi.fn(),
    verifyActiveDoc: noop,
    resetToBlank: vi.fn(),
  }
}

let listBackups: ReturnType<typeof vi.fn<() => Promise<BackupRecord[]>>>
let readFile: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>
let deleteBackup: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>

/**
 * Stub window.lekha and return the stub: assertions go through the returned
 * vi.fn properties (plain function-valued properties), not window.lekha,
 * whose method-style api.d.ts signatures trip unbound-method in expect().
 */
function stubLekha(settings: Settings, ownsSession = true) {
  const stub = {
    getSettings: vi.fn(() => Promise.resolve(settings)),
    shouldRestoreSession: vi.fn(() => Promise.resolve(ownsSession)),
    setSettings: vi.fn((_patch: Partial<Settings>) => Promise.resolve(settings)),
    listThemes: vi.fn(() => Promise.resolve([])),
    setDocumentState: vi.fn(),
    addRecentFile: vi.fn(() => Promise.resolve()),
    getRecentFiles: vi.fn(() => Promise.resolve([])),
    statFile: vi.fn(() => Promise.resolve({ inode: 1, sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0 })),
    readDir: vi.fn(() => Promise.resolve([])),
    listBackups,
    readFile,
    deleteBackup,
    takePendingOpen: vi.fn(() => Promise.resolve([])),
  }
  vi.stubGlobal('lekha', stub)
  return stub
}

beforeEach(() => {
  useEditorStore.getState().reset()
  useDocumentsStore.getState().reset()
  listBackups = vi.fn(() => Promise.resolve([]))
  readFile = vi.fn(() => Promise.resolve(''))
  deleteBackup = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useStartup - crash recovery', () => {
  it('deletes a stale backup (on-disk content equals backup) and does not restore it', async () => {
    listBackups.mockResolvedValue([backup({ content: '# same' })])
    readFile.mockResolvedValue('# same')
    stubLekha(makeSettings())

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => expect(deleteBackup).toHaveBeenCalledWith('b-1'))
    // No tab was created for the stale backup.
    expect(useDocumentsStore.getState().documents).toHaveLength(0)
  })

  it('restores a changed backup as a dirty, recovered tab', async () => {
    listBackups.mockResolvedValue([backup({ content: '# recovered' })])
    readFile.mockResolvedValue('# on disk (different)')
    stubLekha(makeSettings())

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref, setMarkdown } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      const tab = useDocumentsStore.getState().activeDocument()
      expect(tab?.recovered).toBe(true)
    })
    const tab = useDocumentsStore.getState().activeDocument()!
    expect(tab.path).toBe('/a.md')
    expect(tab.isDirty).toBe(true)
    expect(tab.backupId).toBe('b-1')
    expect(tab.markdown).toBe('# recovered')
    expect(setMarkdown).toHaveBeenCalledWith('# recovered')
    expect(deleteBackup).not.toHaveBeenCalled()
  })

  it('restores a backup as not stale when the on-disk read throws (file gone)', async () => {
    listBackups.mockResolvedValue([backup({ content: '# recovered' })])
    // readFile throws for the stale check -> treated as NOT stale.
    readFile.mockRejectedValue(new Error('ENOENT'))
    stubLekha(makeSettings())

    const fileOps = makeFileOps(() => Promise.reject(new Error('ENOENT')))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      const tab = useDocumentsStore.getState().activeDocument()
      expect(tab?.recovered).toBe(true)
    })
    expect(deleteBackup).not.toHaveBeenCalled()
  })

  it('dedupes by path: replaces an already-restored tab buffer instead of duplicating', async () => {
    listBackups.mockResolvedValue([backup({ content: '# recovered' })])
    // The stale-check read returns the on-disk content (different from backup).
    readFile.mockResolvedValue('# on disk')
    stubLekha(makeSettings({ openTabPaths: ['/a.md'], activeTabPath: '/a.md' }))

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      const tab = useDocumentsStore.getState().documents.find((d) => d.path === '/a.md')
      expect(tab?.recovered).toBe(true)
    })
    // Exactly one tab for /a.md (no duplicate), with the recovered buffer.
    const tabs = useDocumentsStore.getState().documents.filter((d) => d.path === '/a.md')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]!.markdown).toBe('# recovered')
    expect(tabs[0]!.isDirty).toBe(true)
    expect(tabs[0]!.backupId).toBe('b-1')
  })

  it('restores an Untitled (path null) backup as a path-less dirty tab', async () => {
    listBackups.mockResolvedValue([backup({ path: null, title: 'Untitled', content: 'draft' })])
    stubLekha(makeSettings())

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      const tab = useDocumentsStore.getState().activeDocument()
      expect(tab?.recovered).toBe(true)
    })
    const tab = useDocumentsStore.getState().activeDocument()!
    expect(tab.path).toBeNull()
    expect(tab.isDirty).toBe(true)
    expect(tab.markdown).toBe('draft')
    // readFile is never consulted for a path-less backup (no stale check).
    expect(readFile).not.toHaveBeenCalled()
  })

  it('a failing recovery for one backup does not abort the others', async () => {
    // Genuinely exercise the per-backup try/catch: make the FIRST backup's
    // recovery throw (readFile rejects for its path), and assert the SECOND
    // (valid Untitled) backup still restores. The first is path-based so its
    // stale-check readFile runs; we make that reject to force the failure path.
    listBackups.mockResolvedValue([
      backup({ backupId: 'b-1', path: '/x.md', content: '# x' }),
      backup({ backupId: 'b-2', path: null, title: 'Untitled', content: 'draft' }),
    ])
    // A rejected readFile is treated as "file gone -> not stale -> restore", so
    // both restore; this also documents that a read failure never aborts the loop.
    readFile.mockRejectedValue(new Error('read failed'))
    stubLekha(makeSettings())

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      const paths = useDocumentsStore.getState().documents.map((d) => d.path)
      expect(paths).toContain(null)
    })
    const paths = useDocumentsStore.getState().documents.map((d) => d.path)
    // Both backups restored: the path-based one and the Untitled one.
    expect(paths).toContain('/x.md')
    expect(paths).toContain(null)
  })

  it('drops a stale backup whose saved file differs only by line endings (CRLF)', async () => {
    // The on-disk file is CRLF while the backup content is LF (getMarkdown is
    // always LF). The stale-check must normalize both sides, recognise the work
    // as already saved, delete the backup, and NOT falsely recover it.
    listBackups.mockResolvedValue([
      backup({ backupId: 'b-eol', path: '/crlf.md', content: 'line 1\nline 2\n' }),
    ])
    readFile.mockResolvedValue('line 1\r\nline 2\r\n')
    stubLekha(makeSettings())

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      expect(deleteBackup).toHaveBeenCalledWith('b-eol')
    })
    const paths = useDocumentsStore.getState().documents.map((d) => d.path)
    expect(paths).not.toContain('/crlf.md')
  })
})

describe('useStartup - session ownership (File > New Window)', () => {
  it('a window that does NOT own the session restores no tabs and recovers no backups', async () => {
    // A persisted session + a pending crash backup exist...
    listBackups.mockResolvedValue([backup({ content: '# recovered' })])
    readFile.mockResolvedValue('# on disk')
    const lekha = stubLekha(
      makeSettings({ openTabPaths: ['/a.md', '/b.md'], activeTabPath: '/a.md' }),
      false, // ...but this is a second window: main denied the claim.
    )

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref, setMarkdown } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    // Let the startup promise chain settle, then assert NOTHING was replayed.
    await waitFor(() => {
      expect(lekha.shouldRestoreSession).toHaveBeenCalledTimes(1)
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(fileOps.restoreTabs).not.toHaveBeenCalled()
    expect(listBackups).not.toHaveBeenCalled()
    expect(useDocumentsStore.getState().documents).toHaveLength(0)
    expect(setMarkdown).not.toHaveBeenCalled()
  })

  it('the owning window still restores tabs and runs recovery', async () => {
    listBackups.mockResolvedValue([])
    readFile.mockResolvedValue('# A')
    stubLekha(makeSettings({ openTabPaths: ['/a.md'], activeTabPath: '/a.md' }), true)

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      expect(fileOps.restoreTabs).toHaveBeenCalledWith(['/a.md'], '/a.md', [])
    })
    expect(listBackups).toHaveBeenCalled()
  })
})

describe('useStartup - secondary window workspace isolation', () => {
  it('a non-owning window does not inherit the last folder', async () => {
    useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })
    const lekha = stubLekha(makeSettings({ lastFolder: '/vault' }), false)

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      expect(lekha.shouldRestoreSession).toHaveBeenCalledTimes(1)
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(lekha.readDir).not.toHaveBeenCalled()
    expect(useWorkspaceStore.getState().rootFolder).toBeNull()
  })

  it('the owning window still restores the last folder', async () => {
    useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })
    stubLekha(makeSettings({ lastFolder: '/vault' }), true)

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))

    await waitFor(() => {
      expect(useWorkspaceStore.getState().rootFolder).toBe('/vault')
    })
  })

  it('a non-owning window never persists its tabs or folder over the session', async () => {
    useWorkspaceStore.setState({ rootFolder: null, fileTree: [] })
    const lekha = stubLekha(makeSettings({ openTabPaths: ['/real.md'], lastFolder: '/vault' }), false)

    const fileOps = makeFileOps((p) => readFile(p))
    const { ref } = makeEditorRef()
    renderHook(() => useStartup(fileOps, ref))
    await waitFor(() => {
      expect(lekha.shouldRestoreSession).toHaveBeenCalledTimes(1)
    })
    await new Promise((r) => setTimeout(r, 0))

    // User activity in the scratch window: opens a file, opens a folder.
    readFile.mockResolvedValue('# scratch')
    useDocumentsStore.getState().openDocument({ path: '/scratch.md', markdown: '# scratch' })
    useWorkspaceStore.getState().setRootFolder('/scratch-folder')
    // Let the debounced persisters (if wrongly armed) fire.
    await new Promise((r) => setTimeout(r, 700))

    const persistedKeys = lekha.setSettings.mock.calls.flatMap(([patch]) => Object.keys(patch))
    expect(persistedKeys).not.toContain('openTabPaths')
    expect(persistedKeys).not.toContain('lastFolder')
  })
})
