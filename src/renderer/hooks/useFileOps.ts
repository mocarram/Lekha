import { type RefObject, useCallback } from 'react'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { useEditorStore } from '@renderer/store/editorStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface FileOps {
  /** Show the OS open-file dialog and open the selected file. */
  open(): Promise<void>
  /** Read a file at a known path and load it into the editor. */
  openPath(path: string): Promise<void>
  /** Save to the current path; falls through to saveAs when no path exists. */
  save(): Promise<void>
  /** Show the OS save-as dialog and write to the chosen path. */
  saveAs(): Promise<void>
  /** Create a fresh blank document. */
  newFile(): void
  /** Show the OS folder picker and populate the workspace file tree. */
  openFolder(): Promise<void>
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Centralised file-operation handler.
 *
 * All operations that touch the file system go through this hook so that
 * store updates, editor state, and Electron IPC calls stay co-located and
 * DRY. Two private helpers keep the "happy paths" short:
 *
 *   loadInto(path, md) - push content into the editor + stores after a read.
 *   persist(path)      - write current editor content + update stores after a write.
 */
export function useFileOps(editorRef: RefObject<EditorPaneHandle | null>): FileOps {
  const editorStore = useEditorStore
  const workspaceStore = useWorkspaceStore

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Load markdown content into the editor and update all related store slices.
   * Shared by open() and openPath().
   */
  const loadInto = useCallback(
    async (path: string, md: string): Promise<void> => {
      // Push content to the editor view.
      editorRef.current?.setMarkdown(md)

      // Update editor store: path, title, markdown, dirty=false.
      editorStore.getState().openFile(path, md)

      // Recompute outline and word/char counts from the parsed document.
      const doc = parseMarkdown(md)
      editorStore.getState().setOutline(getOutline(doc))
      editorStore.getState().setCounts(countWords(doc))

      // Persist to recents and update the OS window title bar.
      await window.lekha.addRecentFile(path)
      const recents = await window.lekha.getRecentFiles()
      workspaceStore.getState().setRecentFiles(recents)

      // Sync OS window title / dirty indicator via the preload bridge.
      const { title } = editorStore.getState()
      window.lekha.setDocumentState({ title, dirty: false, path })
    },
    [editorRef, editorStore, workspaceStore],
  )

  /**
   * Write the current editor content to `path` and sync store + OS state.
   * Shared by save() and saveAs().
   */
  const persist = useCallback(
    async (path: string): Promise<void> => {
      const md = editorRef.current?.getMarkdown() ?? ''
      await window.lekha.writeFile(path, md)

      editorStore.getState().markClean()

      await window.lekha.addRecentFile(path)
      const recents = await window.lekha.getRecentFiles()
      workspaceStore.getState().setRecentFiles(recents)

      const { title } = editorStore.getState()
      window.lekha.setDocumentState({ title, dirty: false, path })
    },
    [editorRef, editorStore, workspaceStore],
  )

  // -------------------------------------------------------------------------
  // Public operations
  // Declarations are ordered so helpers and mutual dependencies are
  // always defined before they are referenced.
  // -------------------------------------------------------------------------

  const openPath = useCallback(
    async (path: string): Promise<void> => {
      const md = await window.lekha.readFile(path)
      await loadInto(path, md)
    },
    [loadInto],
  )

  const open = useCallback(async (): Promise<void> => {
    const path = await window.lekha.openFileDialog()
    if (path !== null) {
      await openPath(path)
    }
  }, [openPath])

  // saveAs must be declared before save so save can reference it.
  const saveAs = useCallback(async (): Promise<void> => {
    const currentTitle = editorStore.getState().title
    const suggestedName = currentTitle.endsWith('.md') ? currentTitle : `${currentTitle}.md`
    const path = await window.lekha.saveAsDialog(suggestedName)
    if (path === null) return

    // Update the store path BEFORE calling persist so that persist reads
    // the correct title after setPath re-derives it.
    editorStore.getState().setPath(path)
    await persist(path)
  }, [editorStore, persist])

  const save = useCallback(async (): Promise<void> => {
    const { path } = editorStore.getState()
    if (path === null) {
      // No path yet - delegate to saveAs.
      await saveAs()
      return
    }
    await persist(path)
  }, [editorStore, persist, saveAs])

  const newFile = useCallback((): void => {
    editorRef.current?.setMarkdown('')
    editorStore.getState().newFile()
    window.lekha.setDocumentState({ title: 'Untitled', dirty: false, path: null })
  }, [editorRef, editorStore])

  const openFolder = useCallback(async (): Promise<void> => {
    const dir = await window.lekha.openFolderDialog()
    if (dir === null) return

    const tree = await window.lekha.readDir(dir)
    workspaceStore.getState().setRootFolder(dir)
    workspaceStore.getState().setFileTree(tree)
    // Persist the chosen folder so it can be restored on next launch.
    await window.lekha.setSettings({ lastFolder: dir })
  }, [workspaceStore])

  return { open, openPath, save, saveAs, newFile, openFolder }
}
