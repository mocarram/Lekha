import { type RefObject, useCallback } from 'react'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { useEditorStore } from '@renderer/store/editorStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import {
  useDocumentsStore,
  type DocumentTab,
} from '@renderer/store/documentsStore'
import { normalizeLineEndings, detectEol } from '@shared/eol'
import { deriveTitle } from '@shared/pathTitle'
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
  /**
   * Move the current file into a folder chosen via the native picker, then
   * reopen it at the new path and refresh the tree. No-op when the document has
   * no path or the user cancels the picker.
   */
  moveCurrentTo(): Promise<void>
  /**
   * Switch the active tab. Snapshots the current document into its tab, then
   * loads the target tab's snapshot into the editor. No-op if already active.
   */
  selectTab(id: string): Promise<void>
  /**
   * Close a tab. When the tab has unsaved changes it is first activated and the
   * save guard runs (cancel aborts the close). When the last tab is closed a
   * fresh blank Untitled document takes its place.
   */
  closeTab(id: string): Promise<void>
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
  const documentsStore = useDocumentsStore

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

      // Keep the active tab snapshot in sync with the freshly loaded content
      // (matters for Revert to Saved, which reloads an already-open tab).
      documentsStore.getState().updateActive({
        markdown: md,
        isDirty: false,
        path,
        title,
        eol: editorStore.getState().eol,
      })
    },
    [editorRef, editorStore, workspaceStore, documentsStore],
  )

  /**
   * Write the current editor content to `path` and sync store + OS state.
   * Shared by save() and saveAs().
   */
  const persist = useCallback(
    async (path: string): Promise<void> => {
      const md = editorRef.current?.getMarkdown() ?? ''
      // Write with the document's chosen line-ending style (LF default; CRLF
      // when detected on open or chosen via the Line Endings menu).
      const out = normalizeLineEndings(md, editorStore.getState().eol)
      await window.lekha.writeFile(path, out)

      editorStore.getState().markClean()

      await window.lekha.addRecentFile(path)
      const recents = await window.lekha.getRecentFiles()
      workspaceStore.getState().setRecentFiles(recents)

      const { title } = editorStore.getState()
      window.lekha.setDocumentState({ title, dirty: false, path })

      // Mirror the saved state into the active tab snapshot.
      documentsStore.getState().updateActive({ markdown: md, isDirty: false, path, title })
    },
    [editorRef, editorStore, workspaceStore, documentsStore],
  )

  // -------------------------------------------------------------------------
  // Tab helpers (snapshot / load / blank)
  // -------------------------------------------------------------------------

  /** Recompute outline + word/char counts from a markdown string. */
  const recompute = useCallback((md: string): void => {
    const doc = parseMarkdown(md)
    editorStore.getState().setOutline(getOutline(doc))
    editorStore.getState().setCounts(countWords(doc))
  }, [editorStore])

  /**
   * Snapshot the live editor + active-document state back into the active tab,
   * so switching away preserves unsaved edits and metadata. No-op when no tab
   * is active.
   */
  const snapshotActive = useCallback((): void => {
    const active = documentsStore.getState().activeDocument()
    if (active === null) return
    const md = editorRef.current?.getMarkdown() ?? active.markdown
    const { isDirty, eol, path, title } = editorStore.getState()
    documentsStore.getState().updateActive({ markdown: md, isDirty, eol, path, title })
  }, [editorRef, editorStore, documentsStore])

  /**
   * Load a tab's snapshot into the editor + editor store WITHOUT touching the
   * disk. Preserves the snapshot's dirty flag and line-ending style.
   */
  const loadTab = useCallback((tab: DocumentTab): void => {
    editorRef.current?.setMarkdown(tab.markdown)
    // openFile resets dirty=false, mode=wysiwyg, eol=detect, derives title.
    editorStore.getState().openFile(tab.path, tab.markdown)
    editorStore.getState().setEol(tab.eol)
    if (tab.isDirty) editorStore.getState().markDirty()
    recompute(tab.markdown)
    window.lekha.setDocumentState({
      title: editorStore.getState().title,
      dirty: tab.isDirty,
      path: tab.path,
    })
  }, [editorRef, editorStore, recompute])

  /** Reset the editor to a blank Untitled document (no tab bookkeeping). */
  const blankEditor = useCallback((): void => {
    editorRef.current?.setMarkdown('')
    editorStore.getState().newFile()
    recompute('')
    window.lekha.setDocumentState({ title: 'Untitled', dirty: false, path: null })
  }, [editorRef, editorStore, recompute])

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

  // Open a file as a tab. With tabs, opening NEVER discards the current
  // document (it stays open in its own tab) so there is no unsaved guard here -
  // the guard runs on tab close / app quit instead.
  //
  // Rules:
  //   - Already open (same path)  -> just activate that tab.
  //   - Active tab is a blank Untitled (no path, not dirty) -> reuse it in
  //     place so the welcome/blank tab is replaced rather than left behind.
  //   - Otherwise -> snapshot the current doc into its tab and add a new tab.
  const openPath = useCallback(
    async (path: string): Promise<void> => {
      const existing = documentsStore.getState().documents.find((d) => d.path === path)
      if (existing) {
        const active = documentsStore.getState().activeDocument()
        if (active?.id !== existing.id) {
          snapshotActive()
          documentsStore.getState().activateDocument(existing.id)
          const tab = documentsStore.getState().activeDocument()
          if (tab) loadTab(tab)
        }
        return
      }

      // Reuse an unmodified Untitled tab in place (the welcome/blank tab) so
      // opening a file replaces it rather than leaving a stray empty tab.
      const active = documentsStore.getState().activeDocument()
      const reuseBlank = active !== null && active.path === null && !active.isDirty

      // Read the file, surfacing a readable error instead of failing silently
      // (e.g. the file was deleted/moved, or permission denied).
      let md: string
      try {
        md = await window.lekha.readFile(path)
      } catch (err) {
        window.alert(
          `Could not open "${path}":\n${err instanceof Error ? err.message : String(err)}`,
        )
        return
      }
      if (reuseBlank) {
        documentsStore.getState().updateActive({
          path,
          title: deriveTitle(path),
          markdown: md,
          isDirty: false,
          eol: detectEol(md),
        })
      } else {
        snapshotActive()
        documentsStore.getState().openDocument({ path, markdown: md })
      }
      await loadInto(path, md)
    },
    [documentsStore, snapshotActive, loadTab, loadInto],
  )

  const open = useCallback(async (): Promise<void> => {
    const path = await window.lekha.openFileDialog()
    if (path !== null) {
      await openPath(path)
    }
  }, [openPath])

  // New document = a new blank tab. Does not discard the current doc (it stays
  // open in its tab), so no unsaved guard is needed.
  const newFile = useCallback((): Promise<void> => {
    snapshotActive()
    documentsStore.getState().newDocument()
    blankEditor()
    return Promise.resolve()
  }, [snapshotActive, documentsStore, blankEditor])

  // Switch the active tab: snapshot the current doc, then load the target.
  const selectTab = useCallback((id: string): Promise<void> => {
    if (documentsStore.getState().activeId === id) return Promise.resolve()
    snapshotActive()
    documentsStore.getState().activateDocument(id)
    const tab = documentsStore.getState().activeDocument()
    if (tab) loadTab(tab)
    return Promise.resolve()
  }, [documentsStore, snapshotActive, loadTab])

  // Close a tab. Dirty tabs are activated and run the save guard first (cancel
  // aborts). Closing the last tab leaves a fresh blank Untitled in its place.
  const closeTab = useCallback(async (id: string): Promise<void> => {
    const tab = documentsStore.getState().documents.find((d) => d.id === id)
    if (tab === undefined) return
    // Activate the target so the guard + save act on the right document.
    if (documentsStore.getState().activeId !== id) {
      await selectTab(id)
    }
    if (editorStore.getState().isDirty) {
      if (!(await guardUnsaved())) return // user cancelled -> abort close
    }
    documentsStore.getState().closeDocument(id)
    const next = documentsStore.getState().activeDocument()
    if (next) {
      loadTab(next)
    } else {
      // No tabs remain: keep a blank Untitled so there is always a document.
      documentsStore.getState().newDocument()
      blankEditor()
    }
  }, [documentsStore, selectTab, editorStore, guardUnsaved, loadTab, blankEditor])

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
    // The file is gone: mark the active doc clean so closing its tab does not
    // prompt to save, then close it (a blank Untitled replaces the last tab).
    editorStore.getState().markClean()
    const activeId = documentsStore.getState().activeId
    if (activeId !== null) {
      await closeTab(activeId)
    } else {
      await newFile()
    }
    await refreshTree()
  }, [editorStore, documentsStore, closeTab, newFile, refreshTree])

  // Move the current file into a folder chosen via the native picker.
  const moveCurrentTo = useCallback(async (): Promise<void> => {
    const { path } = editorStore.getState()
    if (path === null) return
    const destDir = await window.lekha.openFolderDialog()
    if (destDir === null) return
    const newPath = await window.lekha.movePath(path, destDir)
    await refreshTree()
    // Update the path IN PLACE rather than re-opening: the document is the same
    // (only its location changed), so re-reading from disk would duplicate the
    // tab and discard any unsaved in-memory edits. updatePath rewrites the tab;
    // editorStore.setPath keeps the live save target correct.
    documentsStore.getState().updatePath(path, newPath)
    editorStore.getState().setPath(newPath)
    const { title, isDirty } = editorStore.getState()
    window.lekha.setDocumentState({ title, dirty: isDirty, path: newPath })
  }, [editorStore, documentsStore, refreshTree])

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
    moveCurrentTo,
    selectTab,
    closeTab,
  }
}
