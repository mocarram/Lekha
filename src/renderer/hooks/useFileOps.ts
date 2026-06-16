import { type RefObject, useCallback, useRef } from 'react'
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
import { isOpenablePath } from '@shared/openable'
import { deriveTitle } from '@shared/pathTitle'
import { normalizeWindowColor } from '@shared/windowColor'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'

/**
 * Surface a failed file operation as a readable alert. Every user-initiated
 * file op funnels failures through here so none of them silently no-ops (a
 * bare rejection would land in the console-only global handler).
 */
function alertOpError(what: string, err: unknown): void {
  window.alert(`${what}:\n\n${err instanceof Error ? err.message : String(err)}`)
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface FileOps {
  /** Show the OS open-file dialog and open the selected file. */
  open(): Promise<void>
  /** Read a file at a known path and load it into the editor. */
  openPath(path: string): Promise<void>
  /**
   * Session restore: open every previously-open tab in ONE batch. Reads all
   * files in parallel, creates all tabs in a single synchronous pass (one
   * paint), and loads ONLY the remembered active tab into the live editor -
   * restoring tabs through openPath sequentially visibly flipped the editor
   * through every document at startup. Missing/unreadable files are skipped.
   * `pinnedPaths` re-pins the listed tabs (in order) after creation.
   * (Property-style so tests can pass the extracted mock to expect() without
   * tripping unbound-method.)
   */
  restoreTabs: (paths: string[], activePath: string | null, pinnedPaths?: string[]) => Promise<void>
  /** Save to the current path; falls through to saveAs when no path exists. */
  save(): Promise<void>
  /**
   * Auto-save variant of save(): never shows a dialog. No-op for clean or
   * path-less documents. On an external-edit conflict it skips the write
   * (document stays dirty) and reports through `onConflict` so the caller can
   * show a non-blocking notice instead of a modal mid-typing.
   */
  saveQuiet(onConflict: (notice: string) => void): Promise<void>
  /** Show the OS save-as dialog and write to the chosen path. */
  saveAs(): Promise<void>
  /** Create a fresh blank document. */
  newFile(): Promise<void>
  /** Show the OS folder picker and populate the workspace file tree. */
  openFolder(): Promise<void>
  /** Open a folder by absolute path (no dialog) as the workspace root. */
  openFolderPath(dir: string): Promise<void>
  /**
   * Re-read the current root folder and refresh the workspace file tree.
   * Called after any file-tree mutation (create/rename/delete) so the sidebar
   * reflects the on-disk state. No-op when no folder is open.
   */
  refreshTree(): Promise<void>
  /**
   * Re-stat `path` and adopt its current mtime+size as the external-change
   * baseline. Must be called after any write or disk-reload that bypasses
   * persist()/loadInto() (saveAllForClose, folder replace), otherwise the next
   * plain Save falsely reports "changed on disk". Property-style (not method
   * shorthand) so callers can extract it without the unbound-method lint rule.
   */
  refreshDiskSig: (path: string) => Promise<void>
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
  /**
   * Tab-menu bulk closes. PINNED tabs are always skipped. Clean background
   * tabs close in place (the editor never flips through them); dirty/active
   * tabs run the closeTab save guard, and a cancelled guard aborts the
   * remaining closes (VS Code semantics).
   */
  closeOtherTabs(keepId: string): Promise<void>
  /** Close every unpinned tab AFTER `fromId` in the strip order. */
  closeTabsToRight(fromId: string): Promise<void>
  /** Close every clean (saved) unpinned tab; dirty tabs stay open. */
  closeSavedTabs(): Promise<void>
  /** Close every unpinned tab (guarded per dirty tab). */
  closeAllTabs(): Promise<void>
  /**
   * Handle the main-process window-close guard's "Save" choice: save EVERY dirty
   * tab (writing each tab's snapshot, prompting a Save As for path-less tabs) so
   * the window can close clean. A cancelled Save As leaves that tab dirty and
   * stops, so the window stays open and re-prompts on the next close.
   */
  saveAllForClose(): Promise<void>
  /**
   * Handle the main-process window-close guard's "Don't Save" choice: drop EVERY
   * tab's crash backup and mark all clean WITHOUT writing any file, so the window
   * can close and nothing is falsely recovered next launch.
   */
  discardAllForClose(): Promise<void>
  /**
   * Re-point the active document at `newPath` atomically: update the editor
   * store path (re-deriving the title), the documents-store tab path, and the OS
   * window title/dirty indicator. Used by rename/move/detach so the three stay
   * consistent. Options:
   *   remapFrom - old path to remap across ALL open tabs (rename/move); omit to
   *               update only the active tab via updateActive.
   *   dirty     - force the OS-title dirty flag (detach passes true); defaults to
   *               the editor store's current isDirty.
   */
  syncActivePath(newPath: string | null, opts?: SyncActivePathOptions): void
  /**
   * Create a new "Untitled.md" in `dir` (or the workspace root when null),
   * refresh the tree, and open the new file. Surfaces read/write errors via
   * window.alert. No-op when no target directory can be resolved.
   */
  createFileEntry(dir: string | null): Promise<void>
  /**
   * Create a new "Untitled Folder" in `dir` (or the workspace root when null)
   * and refresh the tree. Surfaces errors via window.alert. No-op when no target
   * directory can be resolved.
   */
  createFolderEntry(dir: string | null): Promise<void>
  /**
   * Rename/move a file-tree entry on disk, remap every open tab whose path sits
   * under it, keep the active editor + OS title in sync, and refresh the tree.
   * Surfaces errors via window.alert.
   */
  renameEntry(oldPath: string, newName: string): Promise<void>
  /**
   * Trash a file-tree entry (after a confirm), detach the open document when it
   * (or a containing folder) was deleted, and refresh the tree. Surfaces errors
   * via window.alert.
   */
  deleteEntry(path: string): Promise<void>
  /** Reveal a file-tree entry in the OS file manager. */
  revealEntry(path: string): void
  /**
   * Lazy, watcher-free external-change check for the active document. Stats the
   * active doc's path and: silently recovers a same-folder rename (matched by
   * inode); detaches a moved/deleted file (keeps the buffer) and reports a quiet
   * notice via onNotice. Throttled and single-flight internally so rapid focus
   * toggles do not stack. No-op for unsaved docs or when the bridge is absent.
   *
   * @param onNotice - Called with a notice string when the file was lost, or
   *   null to clear the notice (silent rename recovery). App owns the banner UI.
   */
  verifyActiveDoc(onNotice: (notice: string | null) => void): Promise<void>
  /**
   * Reset the editor to a fresh blank Untitled document WITHOUT the unsaved
   * guard or tab bookkeeping that newFile() performs. Used by the template
   * picker, which runs its own guard then injects the template content.
   */
  resetToBlank(): void
}

/** Options for {@link FileOps.syncActivePath}. */
export interface SyncActivePathOptions {
  /** Old path to remap across all open tabs (rename/move). */
  remapFrom?: string
  /** Force the OS-title dirty flag; defaults to the editor store's isDirty. */
  dirty?: boolean
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

  // External-change check coordination (single-flight + throttle). Refs so the
  // values survive re-renders without re-triggering the verifyActiveDoc callback.
  const extCheckInFlight = useRef(false)
  const extCheckLast = useRef(0)

  // Last-known on-disk signature (mtime + size) per file path, captured when we
  // read (open/revert) or write (save) that path. Used to detect a concurrent
  // external edit BEFORE a Save overwrites it (prevents silent last-writer-wins
  // data loss). Keyed by PATH - not by the active doc - so it stays correct
  // across tab switches without per-tab store plumbing. A ref so it persists
  // across renders and never triggers one.
  const diskSig = useRef<Map<string, { mtimeMs: number; sizeBytes: number }>>(new Map())

  /**
   * Adopt the file's CURRENT on-disk state as the external-change baseline.
   * persist()/loadInto() do this inline; every other code path that writes the
   * file or reloads the buffer from disk (saveAllForClose, folder replace) must
   * call this, or the next plain Save falsely prompts "changed on disk".
   */
  const refreshDiskSig = useCallback(async (path: string): Promise<void> => {
    try {
      const st = await window.lekha.statFile(path)
      diskSig.current.set(path, { mtimeMs: st.mtimeMs, sizeBytes: st.sizeBytes })
    } catch {
      // stat failed - drop the baseline rather than keep a stale one.
      diskSig.current.delete(path)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Document-path sync
  // -------------------------------------------------------------------------

  /**
   * Re-point the active document at `newPath`, keeping the editor store, the
   * documents-store tab(s), and the OS window title/dirty indicator consistent.
   * Consolidates the rename/move/detach trio that was previously hand-rolled in
   * several call sites.
   */
  const syncActivePath = useCallback(
    (newPath: string | null, opts?: SyncActivePathOptions): void => {
      // 1. Documents store: remap across tabs (rename/move) or patch the active.
      if (opts?.remapFrom !== undefined && newPath !== null) {
        documentsStore.getState().updatePath(opts.remapFrom, newPath)
      } else {
        documentsStore.getState().updateActive({ path: newPath })
      }
      // 2. Editor store: update the live save target + re-derive the title.
      editorStore.getState().setPath(newPath)
      // 3. OS window title / dirty indicator (re-derived title; caller may force
      //    the dirty value for the detach case).
      const { title, isDirty } = editorStore.getState()
      window.lekha.setDocumentState({
        title,
        dirty: opts?.dirty ?? isDirty,
        path: newPath,
      })
    },
    [editorStore, documentsStore],
  )

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

      // Capture the file's inode so a later outside rename can be recovered, and
      // record its on-disk signature (mtime+size) as the baseline for detecting a
      // concurrent external edit before a later Save.
      try {
        const st = await window.lekha.statFile(path)
        editorStore.getState().setInode(st.inode)
        documentsStore.getState().updateActive({ inode: st.inode })
        diskSig.current.set(path, { mtimeMs: st.mtimeMs, sizeBytes: st.sizeBytes })
      } catch {
        // stat may fail (rare); leave inode null - detection still detects loss.
        diskSig.current.delete(path)
      }
    },
    [editorRef, editorStore, workspaceStore, documentsStore],
  )

  /**
   * Write the current editor content to `path` and sync store + OS state.
   * Shared by save() and saveAs().
   */
  const persist = useCallback(
    async (
      path: string,
      opts?: { checkExternal?: boolean; onConflict?: (notice: string) => void },
    ): Promise<void> => {
      const md = editorRef.current?.getMarkdown() ?? ''
      // Write with the document's chosen line-ending style (LF default; CRLF
      // when detected on open or chosen via the Line Endings menu).
      const out = normalizeLineEndings(md, editorStore.getState().eol)

      // Concurrent-external-edit guard (plain Save only). If the on-disk file
      // changed since we last read/wrote it (another editor, git, a sync client),
      // writing now would silently discard those changes. Prompt first. Save As
      // is exempt: the user explicitly chose that target path in the dialog.
      if (opts?.checkExternal) {
        const baseline = diskSig.current.get(path)
        if (baseline) {
          try {
            const cur = await window.lekha.statFile(path)
            if (cur.mtimeMs !== baseline.mtimeMs || cur.sizeBytes !== baseline.sizeBytes) {
              // Auto-save must never block typing with a modal: report through
              // onConflict and skip the write (document stays dirty) instead.
              if (opts.onConflict !== undefined) {
                opts.onConflict(
                  'Auto-save paused: this file changed on disk outside Lekha. ' +
                    'Save (Cmd+S) to overwrite it, or use File > Revert to Saved to load the disk version.',
                )
                return
              }
              const proceed = window.confirm(
                'This file has changed on disk since you opened it in Lekha ' +
                  '(another app, git, or a sync client may have edited it).\n\n' +
                  'Saving now will overwrite those external changes with your version.\n\n' +
                  'Overwrite?',
              )
              if (!proceed) return // abort the Save; the document stays dirty
            }
          } catch {
            // stat failed (file gone/unreadable) - nothing external to clobber;
            // fall through and let writeFile (re)create it.
          }
        }
      }

      // Surface write failures instead of swallowing them. On error we return
      // WITHOUT marking clean, so the document stays dirty (work preserved) and
      // any guard that awaited this save sees it is still dirty and aborts rather
      // than discarding. No throw -> no unhandled rejection in fire-and-forget
      // callers (the menu/command 'save').
      try {
        await window.lekha.writeFile(path, out)
      } catch (err) {
        window.alert(
          'Could not save the file:\n\n' +
            (err instanceof Error ? err.message : String(err)) +
            '\n\nYour changes are still in the editor (unsaved).',
        )
        return
      }

      editorStore.getState().markClean()

      await window.lekha.addRecentFile(path)
      const recents = await window.lekha.getRecentFiles()
      workspaceStore.getState().setRecentFiles(recents)

      const { title } = editorStore.getState()
      window.lekha.setDocumentState({ title, dirty: false, path })

      // Crash recovery: work is now safely on disk, so drop the linked backup
      // and clear the tab's backup state. Wrapped so a delete failure can never
      // break the save itself.
      const active = documentsStore.getState().activeDocument()
      const backupId = active?.backupId ?? null
      if (backupId !== null) {
        try {
          await window.lekha.deleteBackup(backupId)
        } catch {
          // ignore - a stale backup is harmless; recovery dedupes/cleans it up.
        }
      }

      // Mirror the saved state into the active tab snapshot (and clear backup
      // state regardless of whether a delete was needed).
      documentsStore.getState().updateActive({
        markdown: md,
        isDirty: false,
        path,
        title,
        backupId: null,
        recovered: false,
      })

      // Refresh the inode AND the on-disk signature baseline (Save As writes a
      // new file/inode; a plain Save bumps mtime). This makes the just-written
      // state the new baseline so the next Save's external-change check compares
      // against what WE wrote, not the pre-save value.
      try {
        const st = await window.lekha.statFile(path)
        editorStore.getState().setInode(st.inode)
        documentsStore.getState().updateActive({ inode: st.inode })
        diskSig.current.set(path, { mtimeMs: st.mtimeMs, sizeBytes: st.sizeBytes })
      } catch {
        // ignore - inode stays as-is; drop a stale signature so we never compare
        // against an unverifiable baseline on the next save.
        diskSig.current.delete(path)
      }
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
    const { isDirty, eol, path, title, inode } = editorStore.getState()
    documentsStore.getState().updateActive({ markdown: md, isDirty, eol, path, title, inode })
    // Crash recovery: if the outgoing tab is dirty, capture its backup now so a
    // tab edited then switched away is protected immediately (independent of the
    // debounced useCrashBackup timer). Assigns a backupId when missing.
    if (isDirty) {
      const backupId = documentsStore.getState().ensureBackupId(active.id)
      if (backupId !== null) {
        // savedAt is authoritative-stamped in main at write time; the value we
        // pass here is a placeholder to satisfy the BackupRecord shape.
        void window.lekha.writeBackup({
          backupId,
          path,
          title,
          content: md,
          eol,
          savedAt: Date.now(),
        })
      }
    }
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
    editorStore.getState().setInode(tab.inode)
    if (tab.isDirty) editorStore.getState().markDirty()
    recompute(tab.markdown)
    window.lekha.setDocumentState({
      title: editorStore.getState().title,
      dirty: tab.isDirty,
      path: tab.path,
    })
  }, [editorRef, editorStore, recompute])

  /**
   * Reset the editor to a blank document (no tab bookkeeping). `title` drives the
   * OS window title: 'Untitled' for a fresh blank doc (default), or '' when the
   * last tab was closed and the editor shows its empty state (no document).
   */
  const blankEditor = useCallback((title = 'Untitled'): void => {
    editorRef.current?.setMarkdown('')
    editorStore.getState().newFile()
    recompute('')
    window.lekha.setDocumentState({ title, dirty: false, path: null })
  }, [editorRef, editorStore, recompute])

  // -------------------------------------------------------------------------
  // Public operations
  // Declarations are ordered so helpers and mutual dependencies are
  // always defined before they are referenced.
  // -------------------------------------------------------------------------

  // saveAs must be declared before save so save can reference it.
  const saveAs = useCallback(async (): Promise<void> => {
    const currentTitle = editorStore.getState().title
    // Keep an existing openable extension (.txt stays .txt); default new or
    // extension-less docs to .md.
    const suggestedName = isOpenablePath(currentTitle) ? currentTitle : `${currentTitle}.md`
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
    // checkExternal: a plain Save of an already-open file must not silently
    // overwrite a concurrent external edit (saveAs targets a user-picked path).
    await persist(path, { checkExternal: true })
  }, [editorStore, persist, saveAs])

  // Auto-save path: dialog-free. Clean/path-less docs are skipped (auto-save
  // must never trigger a Save As); an external-edit conflict skips the write
  // and reports via onConflict rather than blocking with a confirm.
  const saveQuiet = useCallback(async (onConflict: (notice: string) => void): Promise<void> => {
    const { path, isDirty } = editorStore.getState()
    if (path === null || !isDirty) return
    await persist(path, { checkExternal: true, onConflict })
  }, [editorStore, persist])

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

  // Session restore (see the FileOps interface doc). Distinct from openPath:
  // no per-file live-editor load, no recents updates (restoring is not the
  // user "opening" anything - recents already reflect those opens).
  const restoreTabs = useCallback(
    async (
      paths: string[],
      activePath: string | null,
      pinnedPaths: string[] = [],
    ): Promise<void> => {
      // Read everything in parallel; a missing/unreadable file restores as
      // nothing rather than failing the session.
      const entries = await Promise.all(
        paths.map(async (path) => {
          try {
            return { path, markdown: await window.lekha.readFile(path) }
          } catch {
            return null
          }
        }),
      )
      const valid = entries.filter((e): e is { path: string; markdown: string } => e !== null)
      if (valid.length === 0) return

      // One synchronous pass: reuse an unmodified Untitled (the welcome/blank
      // tab) for the FIRST file - the same rule openPath applies - then append
      // the rest. openDocument de-dupes by path internally. React batches the
      // whole pass into a single render, so all tabs appear at once.
      const blank = documentsStore.getState().activeDocument()
      const reuseBlank = blank !== null && blank.path === null && !blank.isDirty
      let first = true
      for (const e of valid) {
        if (first && reuseBlank) {
          documentsStore.getState().updateActive({
            path: e.path,
            title: deriveTitle(e.path),
            markdown: e.markdown,
            isDirty: false,
            eol: detectEol(e.markdown),
          })
        } else {
          documentsStore.getState().openDocument({ path: e.path, markdown: e.markdown })
        }
        first = false
      }

      // Re-pin the persisted pinned tabs in order; setPinned regroups them at
      // the front of the strip, preserving their relative pin order.
      for (const p of pinnedPaths) {
        const tab = documentsStore.getState().documents.find((d) => d.path === p)
        if (tab) documentsStore.getState().setPinned(tab.id, true)
      }

      // Activate the remembered tab (falling back to the last restored, which
      // matches the old sequential behavior) and load ONLY it into the editor.
      const docs = documentsStore.getState().documents
      const targetPath =
        activePath !== null && docs.some((d) => d.path === activePath)
          ? activePath
          : valid[valid.length - 1]!.path
      const target = documentsStore.getState().documents.find((d) => d.path === targetPath)
      if (target) {
        documentsStore.getState().activateDocument(target.id)
        const tab = documentsStore.getState().activeDocument()
        if (tab) loadTab(tab)
      }

      // Disk bookkeeping AFTER the visible restore (parallel): the inode lets
      // an outside rename be recovered, and the mtime+size baseline keeps the
      // pre-save external-edit check working for every restored tab.
      await Promise.all(
        valid.map(async (e) => {
          try {
            const st = await window.lekha.statFile(e.path)
            const tab = documentsStore.getState().documents.find((d) => d.path === e.path)
            if (tab) documentsStore.getState().updateDocument(tab.id, { inode: st.inode })
            diskSig.current.set(e.path, { mtimeMs: st.mtimeMs, sizeBytes: st.sizeBytes })
          } catch {
            diskSig.current.delete(e.path)
          }
        }),
      )
      // The active tab's inode landed after loadTab seeded the editor store;
      // re-sync it (guarded against the user having switched docs meanwhile).
      const cur = documentsStore.getState().activeDocument()
      if (cur !== null && cur.path !== null && editorStore.getState().path === cur.path) {
        editorStore.getState().setInode(cur.inode)
      }
    },
    [documentsStore, editorStore, loadTab],
  )

  // New document = a new blank tab. Does not discard the current doc (it stays
  // open in its tab), so no unsaved guard is needed.
  const newFile = useCallback((): Promise<void> => {
    snapshotActive()
    documentsStore.getState().newDocument()
    blankEditor()
    // Place the caret in the fresh document so it is immediately typeable (and
    // the cursor blinks). Deferred to the next frame: newDocument() triggers a
    // React re-render that commits AFTER this callback, and that commit would
    // otherwise blur a synchronously-focused editor. rAF runs post-commit so the
    // focus sticks. Without this the user would have to click into the editor
    // before the caret appears.
    requestAnimationFrame(() => editorRef.current?.focus())
    return Promise.resolve()
  }, [snapshotActive, documentsStore, blankEditor, editorRef])

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
      // The guard awaits a native dialog the user can sit on. While it is open
      // another path (e.g. selectTab from a click, openPath) can change the
      // active document; if it does, the dialog's answer no longer applies to
      // THIS tab. Snapshot the active id before awaiting and bail if it changed
      // when the dialog resolves, so we never close/save against a stale doc.
      const activeBeforeGuard = documentsStore.getState().activeId
      const proceed = await guardUnsaved()
      if (!proceed) return // user cancelled -> abort close
      if (documentsStore.getState().activeId !== activeBeforeGuard) {
        // The active document changed while the dialog was open; the guard acted
        // on a now-inactive tab. Abort rather than act on a stale active doc.
        return
      }
    }
    // Crash recovery: clear this tab's backup before removing it. On the "Save"
    // path persist already deleted it (backupId is null); on the discard
    // ("Don't Save") path the backupId is still set and must be cleaned up so a
    // discarded tab leaves no backup behind. Wrapped so a delete failure cannot
    // block the close.
    const closing = documentsStore.getState().documents.find((d) => d.id === id)
    const closingBackupId = closing?.backupId ?? null
    if (closingBackupId !== null) {
      try {
        await window.lekha.deleteBackup(closingBackupId)
      } catch {
        // ignore - a leftover backup is harmless; recovery cleans it up.
      }
    }
    documentsStore.getState().closeDocument(id)
    const next = documentsStore.getState().activeDocument()
    if (next) {
      loadTab(next)
    } else {
      // No tabs remain: show the editor empty state (App renders a placeholder
      // when documents.length === 0) instead of spawning a replacement document.
      // Clear the editor surface underneath and drop the OS window title (''),
      // which blankEditor pushes to the OS in a single setDocumentState call.
      blankEditor('')
    }
  }, [documentsStore, selectTab, editorStore, guardUnsaved, loadTab, blankEditor])

  /**
   * Close a batch of tabs (tab-menu bulk operations). Clean BACKGROUND tabs
   * are closed in place - no activation, so the live editor never flips
   * through them. Dirty or active tabs go through closeTab (save guard +
   * editor handoff); when the user CANCELS a guard, the remaining closes are
   * aborted, mirroring VS Code's bulk-close semantics.
   */
  const closeManyTabs = useCallback(async (ids: string[]): Promise<void> => {
    for (const id of ids) {
      const docs = documentsStore.getState()
      const tab = docs.documents.find((d) => d.id === id)
      if (tab === undefined) continue
      if (!tab.isDirty && docs.activeId !== id) {
        // Clean background tab: drop its (rare) crash backup and close in
        // place. Wrapped so a delete failure cannot block the close.
        if (tab.backupId !== null) {
          try { await window.lekha.deleteBackup(tab.backupId) } catch { /* harmless */ }
        }
        documentsStore.getState().closeDocument(id)
        continue
      }
      await closeTab(id)
      // closeTab gives no cancel signal; the tab surviving IS the signal.
      if (documentsStore.getState().documents.some((d) => d.id === id)) return
    }
  }, [documentsStore, closeTab])

  // Tab-menu bulk operations. Each computes its id list from the CURRENT tab
  // order, then funnels through closeManyTabs (guard + cancel semantics above).
  const closeOtherTabs = useCallback(async (keepId: string): Promise<void> => {
    const ids = documentsStore.getState().documents
      .filter((d) => d.id !== keepId && !d.isPinned)
      .map((d) => d.id)
    await closeManyTabs(ids)
    // The kept tab is the user's expressed focus: activate it if the close
    // cascade moved activation elsewhere (closing the previously-active tab
    // hands activation to a neighbour, e.g. a surviving pinned tab).
    const keep = documentsStore.getState().documents.find((d) => d.id === keepId)
    if (keep !== undefined && documentsStore.getState().activeId !== keepId) {
      await selectTab(keepId)
    }
  }, [documentsStore, closeManyTabs, selectTab])

  const closeTabsToRight = useCallback(async (fromId: string): Promise<void> => {
    const docs = documentsStore.getState().documents
    const idx = docs.findIndex((d) => d.id === fromId)
    if (idx === -1) return
    await closeManyTabs(docs.slice(idx + 1).filter((d) => !d.isPinned).map((d) => d.id))
  }, [documentsStore, closeManyTabs])

  const closeSavedTabs = useCallback(async (): Promise<void> => {
    const ids = documentsStore.getState().documents
      .filter((d) => !d.isDirty && !d.isPinned)
      .map((d) => d.id)
    await closeManyTabs(ids)
  }, [documentsStore, closeManyTabs])

  const closeAllTabs = useCallback(async (): Promise<void> => {
    const ids = documentsStore.getState().documents
      .filter((d) => !d.isPinned)
      .map((d) => d.id)
    await closeManyTabs(ids)
  }, [documentsStore, closeManyTabs])

  // "Save" from the main-process window-close guard: save EVERY dirty tab so the
  // window can close clean. Tabs with a path are written directly from their
  // snapshot; path-less tabs each get a Save As dialog. A cancelled Save As (or a
  // write error) leaves that tab dirty and stops, so the window stays open (the
  // pendingClose handshake never completes) and re-prompts on the next close.
  const saveAllForClose = useCallback(async (): Promise<void> => {
    // Fold the live active-editor content into its tab snapshot first.
    snapshotActive()
    // Save every dirty tab that has a path by writing its snapshot directly.
    const withPath = documentsStore.getState().documents.filter((d) => d.isDirty && d.path !== null)
    for (const tab of withPath) {
      try {
        await window.lekha.writeFile(tab.path as string, normalizeLineEndings(tab.markdown, tab.eol))
      } catch (err) {
        window.alert('Could not save "' + tab.title + '":\n\n' + (err instanceof Error ? err.message : String(err)) + '\n\nClosing was cancelled - your other changes are unaffected.')
        return // leave it dirty; window stays open (anyDirty stays true)
      }
      if (tab.backupId !== null) { try { await window.lekha.deleteBackup(tab.backupId) } catch { /* harmless */ } }
      documentsStore.getState().updateDocument(tab.id, { isDirty: false, backupId: null, recovered: false })
      try { await window.lekha.addRecentFile(tab.path as string) } catch { /* ignore */ }
      // The write bumped the file's mtime past the open-time baseline; adopt the
      // just-written state so a cancelled close + later Save does not falsely
      // prompt "changed on disk".
      await refreshDiskSig(tab.path as string)
    }
    // If the active tab was just saved, clear the LIVE editor dirty flag too so
    // window-level dirtiness can reach false.
    const active = documentsStore.getState().activeDocument()
    if (active !== null && !active.isDirty) editorStore.getState().markClean()
    // Path-less dirty tabs need a Save As dialog each. Activate and save them one
    // at a time; a cancelled Save As leaves that tab dirty, so we stop (window
    // stays open and will re-prompt on the next close).
    // Guard the loop against infinite spins.
    let guard = 0
    while (guard++ < 1000) {
      const pathless = documentsStore.getState().documents.find((d) => d.isDirty && d.path === null)
      if (pathless === undefined) break
      await selectTab(pathless.id)
      await saveAs()
      if (editorStore.getState().isDirty) return // user cancelled Save As -> stop
    }
  }, [snapshotActive, documentsStore, editorStore, selectTab, saveAs, refreshDiskSig])

  // "Don't Save" from the main-process window-close guard: drop EVERY tab's crash
  // backup and mark all clean, WITHOUT writing any file, so the window can close
  // and nothing is falsely recovered next launch.
  const discardAllForClose = useCallback(async (): Promise<void> => {
    for (const tab of documentsStore.getState().documents) {
      if (tab.backupId !== null) { try { await window.lekha.deleteBackup(tab.backupId) } catch { /* harmless */ } }
      documentsStore.getState().updateDocument(tab.id, { isDirty: false, backupId: null, recovered: false })
    }
    editorStore.getState().markClean()
  }, [documentsStore, editorStore])

  // Open a folder by absolute path (no dialog): read its tree and set it as the
  // workspace root. Shared by openFolder (dialog) and sidebar drag-and-drop.
  // lastFolder is persisted by the useStartup subscriber watching rootFolder.
  const openFolderPath = useCallback(async (dir: string): Promise<void> => {
    try {
      const tree = await window.lekha.readDir(dir)
      workspaceStore.getState().setRootFolder(dir)
      workspaceStore.getState().setFileTree(tree)
      // Apply this folder's marker color (overrides any ephemeral color from a
      // previously folderless window). Best-effort: a settings read failure
      // just leaves the color unchanged.
      try {
        const settings = await window.lekha.getSettings()
        workspaceStore.getState().setWindowColor(normalizeWindowColor(settings.folderColors[dir]))
      } catch {
        // Settings read failed: clear the color rather than leave the previous
        // folder's color showing under the newly opened folder.
        workspaceStore.getState().setWindowColor(null)
      }
    } catch (err) {
      alertOpError(`Could not open the folder "${dir}"`, err)
    }
  }, [workspaceStore])

  // openFolder does NOT replace the current document, so it does not need
  // the unsaved-changes guard.
  const openFolder = useCallback(async (): Promise<void> => {
    const dir = await window.lekha.openFolderDialog()
    if (dir === null) return
    await openFolderPath(dir)
  }, [openFolderPath])

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
    try {
      const md = await window.lekha.readFile(path)
      await loadInto(path, md)
    } catch (err) {
      // Read failed (file gone, permissions): keep the in-memory buffer intact.
      alertOpError('Could not revert to the saved version', err)
    }
  }, [editorStore, loadInto])

  // Duplicate the current file on disk and open the copy.
  const duplicateCurrent = useCallback(async (): Promise<void> => {
    const { path } = editorStore.getState()
    if (path === null) return
    try {
      const newPath = await window.lekha.duplicatePath(path)
      await refreshTree()
      await openPath(newPath)
    } catch (err) {
      alertOpError('Could not duplicate the file', err)
    }
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
    let newPath: string
    try {
      newPath = await window.lekha.movePath(path, destDir)
    } catch (err) {
      // movePath rejects on a name collision in the destination, among others.
      alertOpError('Could not move the file', err)
      return
    }
    await refreshTree()
    // Update the path IN PLACE rather than re-opening: the document is the same
    // (only its location changed), so re-reading from disk would duplicate the
    // tab and discard any unsaved in-memory edits. syncActivePath rewrites the
    // tab(s), keeps the live save target correct, and re-syncs the OS title.
    syncActivePath(newPath, { remapFrom: path })
  }, [editorStore, refreshTree, syncActivePath])

  // -------------------------------------------------------------------------
  // File-tree operations (create / rename / delete / reveal)
  //
  // Each mutating op goes through window.lekha then refreshes the tree so the
  // sidebar reflects the on-disk state. New entries get a default name (the
  // user renames via the context menu). Delete uses the main-process
  // shell.trashItem (recoverable) and is gated behind a light confirm.
  // -------------------------------------------------------------------------

  // Resolve the directory a new entry is created in: the passed (right-clicked)
  // folder, or the workspace root when invoked from the empty/root area.
  const resolveDir = useCallback((dir: string | null): string | null => {
    return dir ?? workspaceStore.getState().rootFolder
  }, [workspaceStore])

  const createFileEntry = useCallback(async (dir: string | null): Promise<void> => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      const path = await window.lekha.createFile(target, 'Untitled.md')
      await refreshTree()
      // Open the freshly created (empty) file so the user can start typing.
      await openPath(path)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [resolveDir, refreshTree, openPath])

  const createFolderEntry = useCallback(async (dir: string | null): Promise<void> => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      await window.lekha.createFolder(target, 'Untitled Folder')
      await refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [resolveDir, refreshTree])

  const renameEntry = useCallback(async (oldPath: string, newName: string): Promise<void> => {
    try {
      const newPath = await window.lekha.renamePath(oldPath, newName)
      // Update EVERY open tab whose path matches (or sits under) the renamed
      // entry so no tab keeps a stale on-disk path.
      documentsStore.getState().updatePath(oldPath, newPath)
      // If the renamed entry is the active document, also update the editor's
      // live path + OS title so saves keep targeting the right file. updatePath
      // already ran above, so syncActivePath only needs setPath + setDocumentState.
      if (editorStore.getState().path === oldPath) {
        syncActivePath(newPath)
      }
      await refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [documentsStore, editorStore, syncActivePath, refreshTree])

  const deleteEntry = useCallback(async (path: string): Promise<void> => {
    // Confirm before trashing. trashItem is recoverable (OS trash), but a
    // confirm avoids accidental one-click deletes.
    if (!window.confirm('Move this item to the Trash?')) return
    try {
      await window.lekha.deletePath(path)
      // If the open document was deleted - directly, or because a folder
      // containing it was trashed - clear its path so a later save uses Save As
      // rather than rewriting the trashed location. The buffer is kept.
      const openPathValue = editorStore.getState().path
      if (
        openPathValue !== null &&
        (openPathValue === path || openPathValue.startsWith(path + '/'))
      ) {
        syncActivePath(null)
      }
      await refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [editorStore, syncActivePath, refreshTree])

  const revealEntry = useCallback((path: string): void => {
    void window.lekha.revealPath(path)
  }, [])

  // -------------------------------------------------------------------------
  // External-change detection (lazy, watcher-free).
  //
  // When the window regains focus (i.e. the user returns from Finder), do ONE
  // cheap stat of the active document's path. A same-folder rename is recovered
  // silently (the tab follows the new name via its inode); a move-elsewhere or
  // delete keeps the buffer but detaches the doc from disk and reports a quiet,
  // non-blocking notice via onNotice. No fs watchers, no polling, nothing on the
  // typing path.
  // -------------------------------------------------------------------------
  const verifyActiveDoc = useCallback(
    async (onNotice: (notice: string | null) => void): Promise<void> => {
      if (typeof window.lekha === 'undefined') return
      const { path, inode } = editorStore.getState()
      if (path === null || inode === null) return // unsaved / no inode to match
      if (extCheckInFlight.current) return
      const now = Date.now()
      if (now - extCheckLast.current < 1000) return // throttle rapid focus toggles
      extCheckLast.current = now
      extCheckInFlight.current = true
      try {
        const res = await window.lekha.verifyOpenFile({ path, inode })
        // The active doc may have changed while the check was in flight - bail.
        if (editorStore.getState().path !== path) return
        if (res.status === 'renamed') {
          syncActivePath(res.newPath, { remapFrom: path })
          onNotice(null)
        } else if (res.status === 'missing') {
          // Keep the buffer (no data loss); detach so the next Save is Save As.
          editorStore.getState().markDirty()
          // Mirror the forced-dirty state into the active tab snapshot too, so a
          // later tab switch does not resurrect a clean flag for a detached doc.
          documentsStore.getState().updateActive({ isDirty: true })
          syncActivePath(null, { dirty: true })
          onNotice(
            'This file was moved or deleted outside Lekha. Your changes are kept - use Save to write it again.',
          )
        }
      } catch {
        // Verification failed (e.g. bridge unavailable) - leave state untouched.
      } finally {
        extCheckInFlight.current = false
      }
    },
    [editorStore, documentsStore, syncActivePath],
  )

  // Reset the editor to a fresh blank Untitled document WITHOUT the unsaved
  // guard or tab bookkeeping newFile() performs. The template picker runs its
  // own guard, then injects template content after this clears the editor.
  const resetToBlank = useCallback((): void => {
    blankEditor()
  }, [blankEditor])

  return {
    open,
    openPath,
    restoreTabs,
    save,
    saveQuiet,
    saveAs,
    newFile,
    openFolder,
    openFolderPath,
    refreshTree,
    refreshDiskSig,
    guardUnsaved,
    revertToSaved,
    duplicateCurrent,
    deleteCurrent,
    moveCurrentTo,
    selectTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeSavedTabs,
    closeAllTabs,
    saveAllForClose,
    discardAllForClose,
    syncActivePath,
    createFileEntry,
    createFolderEntry,
    renameEntry,
    deleteEntry,
    revealEntry,
    verifyActiveDoc,
    resetToBlank,
  }
}
