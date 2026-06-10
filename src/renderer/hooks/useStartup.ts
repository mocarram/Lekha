/**
 * useStartup.ts
 *
 * Runs once on mount to restore persisted settings (sidebar visibility, sidebar
 * tab, last folder, recent files) and subscribes to the workspaceStore to
 * persist relevant slices back whenever they change.
 *
 * Restore-guard: a `restoring` flag is set to true during the initial
 * getSettings() call and cleared once all values have been applied. The
 * workspaceStore subscriber checks this flag and skips writes while it is set,
 * preventing the restored values from being echoed back to the settings file.
 *
 * Folder restore: if lastFolder is set, readDir() is called and the result is
 * applied to the workspace store. A missing or deleted folder is silently
 * ignored (the error is caught and discarded).
 */
import { type RefObject, useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import { applyTheme, applyFontSize, injectUserThemes } from '@renderer/themes/index'
import { setSmartPunctuation } from '@renderer/editor/createState'
import { clampSidebarWidth } from '@renderer/components/sidebarResizerUtils'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'
import type { BackupRecord } from '@shared/types'
import { normalizeLineEndings } from '@shared/eol'
import type { FileOps } from './useFileOps'

// Debounce interval (ms) for persisting sidebar state changes.
const PERSIST_DEBOUNCE_MS = 300

/**
 * Restore one crash backup into the document session + the live editor.
 *
 * - Dedupe by path: when a tab for the backup's (non-null) path is already open
 *   (restored from openTabPaths), reuse it and overwrite its buffer with the
 *   recovered content - the dirty recovered version wins over the on-disk one.
 * - Otherwise open a fresh tab seeded with the backup's content/path/title.
 *
 * In both cases the tab is made active, its buffer is pushed into the editor
 * view, and it is marked dirty + recovered with the backup's id so a later Save
 * clears the correct backup file and the recovery banner shows for it.
 */
function recoverBackup(
  backup: BackupRecord,
  editorRef: RefObject<EditorPaneHandle | null> | null,
): void {
  const docs = useDocumentsStore.getState()

  // Dedupe by path against already-restored tabs (only meaningful for saved
  // docs; Untitled backups always open a fresh tab).
  const existing =
    backup.path !== null
      ? docs.documents.find((d) => d.path === backup.path)
      : undefined

  if (existing) {
    docs.activateDocument(existing.id)
  } else {
    docs.openDocument({ path: backup.path, markdown: backup.content })
  }

  // Push the recovered buffer into the live ProseMirror view (the store update
  // below mirrors it, but the view must be told explicitly to render it).
  editorRef?.current?.setMarkdown(backup.content)

  // Drive the editor store like a normal load, then layer on the recovered
  // (dirty) state and the document's persisted line-ending style.
  const editor = useEditorStore.getState()
  editor.openFile(backup.path, backup.content)
  editor.setEol(backup.eol)
  editor.markDirty()

  // Mirror everything into the active tab snapshot + the recovery flags.
  docs.updateActive({
    markdown: backup.content,
    isDirty: true,
    path: backup.path,
    title: backup.title,
    eol: backup.eol,
    recovered: true,
    backupId: backup.backupId,
  })

  // Sync the OS window title-bar dirty state. Use the backup's title (not the
  // editor store's derived title) so the title bar matches the tab label for a
  // recovered document, including Untitled docs.
  window.lekha.setDocumentState({
    title: backup.title,
    dirty: true,
    path: backup.path,
  })
}

/**
 * Apply persisted settings to the workspace store and set up persistence
 * subscriptions for sidebar state and last folder.
 *
 * @param fileOps - Used to restore previously open document tabs (openPath
 *   de-dupes + adds tabs; selectTab activates the last-active one).
 * @param editorRef - The live editor handle, used by crash recovery to seed a
 *   recovered backup's buffer into the editor view (the store alone is not
 *   enough; the ProseMirror view must be told to render the recovered content).
 * @param onSidebarWidth - Called with the restored sidebar width (px) so App
 *   can update its sidebarWidth state and apply the CSS variable.
 */
export function useStartup(
  fileOps: FileOps,
  editorRef: RefObject<EditorPaneHandle | null>,
  onSidebarWidth?: (px: number) => void,
): void {
  // Tracks whether we are currently in the initial restore phase.
  // Using a plain ref (not state) so changes to it never cause re-renders.
  const restoringRef = useRef(false)

  // Whether THIS window owns the persisted session (true for the first window
  // of the app run; false for File > New Window). Owners restore AND persist
  // the session slices (lastFolder, open tabs); secondary windows do neither -
  // a scratch window must never clobber the real session in settings. Global
  // preferences (theme, sidebar visibility, ...) persist from any window.
  const ownsSessionRef = useRef(true)

  // Debounce timer for sidebar-state persistence.
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce timer for open-tabs persistence.
  const tabsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hold the latest fileOps in a ref so the mount-only effect can call the
  // current openPath/selectTab without re-subscribing on every render (fileOps
  // is a fresh object each render). Synced in an effect (never during render).
  const fileOpsRef = useRef(fileOps)
  useEffect(() => {
    fileOpsRef.current = fileOps
  })

  // Hold the editor handle in a ref so the mount-only effect's recovery step can
  // seed recovered content into the live view without re-subscribing.
  const editorElemRef = useRef(editorRef)
  useEffect(() => {
    editorElemRef.current = editorRef
  })

  useEffect(() => {
    if (typeof window.lekha === 'undefined') return

    // -----------------------------------------------------------------
    // Phase 1: Restore settings from the main process.
    // -----------------------------------------------------------------
    restoringRef.current = true

    void window.lekha.getSettings().then(async (s) => {
      // Apply sidebar preferences.
      useWorkspaceStore.getState().setSidebarVisible(s.sidebarVisible)
      useWorkspaceStore.getState().setSidebarTab(s.sidebarTab)

      // Apply recent files list.
      useWorkspaceStore.getState().setRecentFiles(s.recentFiles)

      // Load + inject user-authored themes BEFORE applying the persisted theme
      // so a saved custom-theme id resolves (instead of falling back to github).
      try {
        const userThemes = await window.lekha.listThemes()
        injectUserThemes(userThemes)
      } catch {
        // Theme folder missing/unreadable - proceed with built-in themes only.
      }

      // Restore persisted theme. applyTheme sets data-theme on <html> so all
      // CSS theme token overrides take effect immediately.
      applyTheme(s.theme)

      // Restore the editor font size. applyFontSize sets the --editor-font-size
      // CSS var on <html>; github.css reads it for the .ProseMirror font-size.
      applyFontSize(s.fontSize)

      // Restore focus mode, typewriter mode, equation numbering, and auto-save.
      useEditorStore.getState().setFocusMode(s.focusMode)
      useEditorStore.getState().setTypewriterMode(s.typewriterMode)
      useEditorStore.getState().setEquationNumbering(s.equationNumbering)
      useEditorStore.getState().setAutoSave(s.autoSave)
      // Smart punctuation affects the input-rule plugin built per editor state,
      // so apply it before the first document is loaded.
      setSmartPunctuation(s.smartPunctuation)

      // Restore sidebar width. Clamp to the valid range in case a corrupt or
      // out-of-range value was persisted. Apply the CSS var and notify App.
      const restoredWidth = clampSidebarWidth(s.sidebarWidth)
      document.documentElement.style.setProperty('--sidebar-width', `${restoredWidth}px`)
      onSidebarWidth?.(restoredWidth)

      // Session ownership: exactly ONE window per app run replays the session
      // (the last folder, the previous tabs, and crash recovery below).
      // Without this claim every File > New Window re-ran the whole restore
      // and duplicated the session instead of opening blank. Global
      // PREFERENCES (theme, font, sidebar width, ...) restored above apply to
      // every window. An unreachable bridge defaults to restoring (single-
      // window startup must never lose the session).
      let ownsSession = true
      try {
        ownsSession = await window.lekha.shouldRestoreSession()
      } catch {
        ownsSession = true
      }
      ownsSessionRef.current = ownsSession

      // Restore last folder if one was persisted. A missing/deleted folder
      // is silently ignored to avoid noisy startup errors. New windows start
      // with an empty workspace - no inherited folder.
      if (ownsSession && s.lastFolder !== null) {
        try {
          const tree = await window.lekha.readDir(s.lastFolder)
          useWorkspaceStore.getState().setRootFolder(s.lastFolder)
          useWorkspaceStore.getState().setFileTree(tree)
        } catch {
          // Folder no longer exists or is not readable - skip silently.
        }
      }

      // Restore previously open document tabs (saved files only) in ONE batch:
      // parallel reads, all tabs created in a single pass, and only the
      // remembered active tab loaded into the live editor. (Restoring through
      // openPath sequentially visibly flipped the editor through every
      // document at startup.) Missing/unreadable files are skipped.
      if (ownsSession && s.openTabPaths.length > 0) {
        try {
          await fileOpsRef.current.restoreTabs(s.openTabPaths, s.activeTabPath)
        } catch {
          // Restore is best-effort: a failure leaves the welcome tab in place.
        }
      }

      // -----------------------------------------------------------------
      // Crash recovery: restore unsaved buffers left behind by a crash.
      // -----------------------------------------------------------------
      // Runs AFTER the openTabPaths restore so dedupe-by-path can compare
      // against already-restored tabs. A clean exit leaves no backups (saved or
      // discarded docs delete theirs), so this is usually a no-op. Each backup
      // is handled in its own try/catch: a single bad backup never breaks
      // startup. Gated on session ownership: a New Window must not recover the
      // same backups into a second window.
      try {
        const backups = ownsSession ? await window.lekha.listBackups() : []
        for (const backup of backups) {
          try {
            // Stale check: if the backup has a path and the on-disk file's
            // current content already equals the backup, the work was saved
            // before the crash -> drop the backup, no false-positive recovery.
            // If the read throws (file gone), treat it as NOT stale and restore.
            // Compare with line endings normalized to LF on both sides: the
            // on-disk file is read raw (CRLF preserved) while backup.content is
            // always LF (from getMarkdown), so a CRLF document would otherwise
            // never match its own saved file and be falsely "recovered".
            if (backup.path !== null) {
              let onDisk: string | null = null
              try {
                onDisk = await window.lekha.readFile(backup.path)
              } catch {
                onDisk = null // file is gone -> the backup is the only copy
              }
              if (
                onDisk !== null &&
                normalizeLineEndings(onDisk, 'lf') ===
                  normalizeLineEndings(backup.content, 'lf')
              ) {
                await window.lekha.deleteBackup(backup.backupId)
                continue
              }
            }

            // Seed the recovered content into a tab + the editor view, mark it
            // dirty + recovered, and link the backup id so a later Save clears
            // the right backup file.
            recoverBackup(backup, editorElemRef.current)
          } catch {
            // A single malformed/unreadable backup must not abort recovery.
          }
        }
      } catch {
        // listBackups failed (bridge unavailable / read error) - skip recovery.
      }

      // Restore phase is complete. Future store changes should be persisted.
      restoringRef.current = false

      // -----------------------------------------------------------------
      // Launch-open: files the OS asked Lekha to open ("Open With" /
      // double-click on macOS, or a command-line arg on Win/Linux) before this
      // window existed. We drain the queue AFTER restore so the launched file
      // opens on top of (and active over) the restored session, and AFTER the
      // restore flag is cleared so the new tab is persisted normally. Done last
      // so a launched file wins focus over recovered/restored tabs.
      try {
        const launchPaths = await window.lekha.takePendingOpen()
        for (const p of launchPaths) {
          try {
            await fileOpsRef.current.openPath(p)
          } catch {
            // File no longer exists or is not readable - skip silently.
          }
        }
      } catch {
        // Bridge unavailable - nothing to open at launch.
      }
    })

    // -----------------------------------------------------------------
    // Phase 2: Subscribe to workspace store to persist relevant slices.
    // -----------------------------------------------------------------
    // We watch sidebarVisible, sidebarTab, and rootFolder. Debouncing the
    // write avoids a flood of IPC calls when the user resizes the sidebar.
    const unsubscribe = useWorkspaceStore.subscribe((state, prev) => {
      // Skip writes during the initial restore to prevent echo-back.
      if (restoringRef.current) return

      // Persist sidebar visibility change.
      if (state.sidebarVisible !== prev.sidebarVisible) {
        if (sidebarTimerRef.current !== null) clearTimeout(sidebarTimerRef.current)
        sidebarTimerRef.current = setTimeout(() => {
          sidebarTimerRef.current = null
          void window.lekha.setSettings({ sidebarVisible: state.sidebarVisible })
        }, PERSIST_DEBOUNCE_MS)
      }

      // Persist sidebar tab change.
      if (state.sidebarTab !== prev.sidebarTab) {
        void window.lekha.setSettings({ sidebarTab: state.sidebarTab })
      }

      // Persist last-open folder change - session-owning window only (a
      // secondary window's folder is scratch state and must not clobber the
      // session's lastFolder).
      if (ownsSessionRef.current && state.rootFolder !== prev.rootFolder) {
        void window.lekha.setSettings({ lastFolder: state.rootFolder })
      }
    })

    // -----------------------------------------------------------------
    // Phase 3: Subscribe to documentsStore to persist the open-tab set.
    // -----------------------------------------------------------------
    // Only the saved (path !== null) tabs and the active tab's path are
    // persisted, and only when that signature actually changes - markdown
    // edits (which fire updateActive on every keystroke) are ignored.
    const tabsSignature = (s: ReturnType<typeof useDocumentsStore.getState>): string => {
      const paths = s.documents.map((d) => d.path ?? '').join('|')
      const active = s.documents.find((d) => d.id === s.activeId)?.path ?? ''
      return `${paths}::${active}`
    }
    const unsubscribeTabs = useDocumentsStore.subscribe((state, prev) => {
      if (restoringRef.current) return
      // Session-owning window only: a New Window's tabs are scratch state and
      // must not overwrite the real session's openTabPaths.
      if (!ownsSessionRef.current) return
      if (tabsSignature(state) === tabsSignature(prev)) return
      if (tabsTimerRef.current !== null) clearTimeout(tabsTimerRef.current)
      tabsTimerRef.current = setTimeout(() => {
        tabsTimerRef.current = null
        const s = useDocumentsStore.getState()
        const openTabPaths = s.documents
          .map((d) => d.path)
          .filter((p): p is string => p !== null)
        const activeTabPath = s.documents.find((d) => d.id === s.activeId)?.path ?? null
        void window.lekha.setSettings({ openTabPaths, activeTabPath })
      }, PERSIST_DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      unsubscribeTabs()
      if (sidebarTimerRef.current !== null) {
        clearTimeout(sidebarTimerRef.current)
        sidebarTimerRef.current = null
      }
      if (tabsTimerRef.current !== null) {
        clearTimeout(tabsTimerRef.current)
        tabsTimerRef.current = null
      }
    }
    // onSidebarWidth is the only non-stable dep - it is setSidebarWidth from
    // useState in App which React guarantees is stable across renders. Including
    // it satisfies the exhaustive-deps rule without causing extra re-runs.
    // All other deps (window.lekha, store methods) are stable singletons.
  }, [onSidebarWidth])
}
