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
  newFile(): Promise<void>
  /** Show the OS folder picker and populate the workspace file tree. */
  openFolder(): Promise<void>
  /**
   * Re-read the current root folder and refresh the workspace file tree.
   * Called after any file-tree mutation (create/rename/delete) so the sidebar
   * reflects the on-disk state. No-op when no folder is open.
   */
  refreshTree(): Promise<void>
  /**
   * Guard against discarding unsaved changes.
   * Returns true when it is safe to proceed (clean, saved, or "Don't Save").
   * Returns false when the user cancelled or Save As was cancelled.
   */
  guardUnsaved(): Promise<boolean>
  /**
   * Reload the current file from disk, discarding in-memory changes
   * (File ▸ Revert to Saved). No-op when there is no path; confirms first when
   * the document is dirty.
   */
  revertToSaved(): Promise<void>
  /**
   * Duplicate the current file on disk ("name copy.md"), refresh the tree, and
   * open the copy. No-op when the document has no path (unsaved).
   */
  duplicateCurrent(): Promise<void>
  /**
   * Move the current file to the OS trash (after confirming), then reset to a
   * blank document and refresh the tree. No-op when the document has no path.
   */
  deleteCurrent(): Promise<void>
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

  /**
   * Guard against discarding unsaved changes.
   *
   * Returns true  - it is safe to proceed (clean, saved, or user chose "Don't Save").
   * Returns false - the operation should be aborted (user cancelled, or Save As was cancelled).
   *
   * Flow:
   *   not dirty         -> return true immediately (no dialog needed).
   *   dirty + 'save'    -> await save(); if still dirty (Save As cancelled) -> false; else true.
   *   dirty + 'dontSave'-> return true (discard, proceed).
   *   dirty + 'cancel'  -> return false (abort the operation).
   */
  const guardUnsaved = useCallback(async (): Promise<boolean> => {
    if (!editorStore.getState().isDirty) return true

    const choice = await window.lekha.confirmUnsaved()

    if (choice === 'dontSave') return true

    if (choice === 'save') {
      await save()
      // If the store is still dirty, the user cancelled the Save As dialog.
      // Abort the pending operation so the document is not discarded.
      return !editorStore.getState().isDirty
    }

    // choice === 'cancel'
    return false
  }, [editorStore, save])

  const openPath = useCallback(
    async (path: string): Promise<void> => {
      if (!(await guardUnsaved())) return
      const md = await window.lekha.readFile(path)
      await loadInto(path, md)
    },
    [guardUnsaved, loadInto],
  )

  const open = useCallback(async (): Promise<void> => {
    if (!(await guardUnsaved())) return
    const path = await window.lekha.openFileDialog()
    if (path !== null) {
      // openPath's own guardUnsaved would re-prompt; call loadInto directly
      // since we already confirmed above.
      const md = await window.lekha.readFile(path)
      await loadInto(path, md)
    }
  }, [guardUnsaved, loadInto])

  const newFile = useCallback(async (): Promise<void> => {
    if (!(await guardUnsaved())) return
    editorRef.current?.setMarkdown('')
    editorStore.getState().newFile()
    window.lekha.setDocumentState({ title: 'Untitled', dirty: false, path: null })
  }, [editorRef, editorStore, guardUnsaved])

  // openFolder does NOT replace the current document, so it does not need
  // the unsaved-changes guard.
  const openFolder = useCallback(async (): Promise<void> => {
    const dir = await window.lekha.openFolderDialog()
    if (dir === null) return

    const tree = await window.lekha.readDir(dir)
    workspaceStore.getState().setRootFolder(dir)
    workspaceStore.getState().setFileTree(tree)
    // Note: lastFolder is persisted by the useStartup subscriber that watches
    // workspaceStore.rootFolder - no explicit setSettings call needed here.
  }, [workspaceStore])

  // Re-read the open root folder and push the fresh tree into the store.
  // No-op when no folder is open (nothing to refresh).
  const refreshTree = useCallback(async (): Promise<void> => {
    const root = workspaceStore.getState().rootFolder
    if (root === null) return
    const tree = await window.lekha.readDir(root)
    workspaceStore.getState().setFileTree(tree)
  }, [workspaceStore])

  // Reload the current file from disk, discarding in-memory edits. Confirms
  // first when the document has unsaved changes.
  const revertToSaved = useCallback(async (): Promise<void> => {
    const { path, isDirty } = editorStore.getState()
    if (path === null) return
    if (
      isDirty &&
      !window.confirm(
        'Revert to the last saved version? Your unsaved changes will be lost.',
      )
    ) {
      return
    }
    const md = await window.lekha.readFile(path)
    await loadInto(path, md)
  }, [editorStore, loadInto])

  // Duplicate the current file on disk and open the copy.
  const duplicateCurrent = useCallback(async (): Promise<void> => {
    const { path } = editorStore.getState()
    if (path === null) return
    const newPath = await window.lekha.duplicatePath(path)
    await refreshTree()
    await openPath(newPath)
  }, [editorStore, refreshTree, openPath])

  // Move the current file to trash (after confirm), then reset to a blank doc.
  const deleteCurrent = useCallback(async (): Promise<void> => {
    const { path } = editorStore.getState()
    if (path === null) return
    if (
      !window.confirm(
        'Move this file to the Trash? You can restore it from the system Trash.',
      )
    ) {
      return
    }
    await window.lekha.deletePath(path)
    await newFile()
    await refreshTree()
  }, [editorStore, newFile, refreshTree])

  return {
    open,
    openPath,
    save,
    saveAs,
    newFile,
    openFolder,
    refreshTree,
    guardUnsaved,
    revertToSaved,
    duplicateCurrent,
    deleteCurrent,
  }
}
