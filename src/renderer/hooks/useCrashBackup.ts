/**
 * useCrashBackup - always-on crash-recovery net for unsaved buffers.
 *
 * Independent of the (opt-in) auto-save setting. While the active document is
 * dirty, it writes a snapshot of the live buffer to a safe backup location in
 * app data (never the user's real file), so unsaved work survives an app/OS
 * crash. Backups are cleared on a successful save or an explicit discard (see
 * useFileOps); a clean exit therefore leaves no backups, while a crash leaves
 * them behind for recovery on next launch.
 *
 * Behaviour (mirrors useAutoSave's structure):
 *   - When the active doc isDirty: schedules a backup write ~5000ms after the
 *     last change. Each change resets the clock (classic debounce).
 *   - Flushes an immediate backup write on window `blur`.
 *   - Covers Untitled (path null) documents too - the whole point is to capture
 *     ALL unsaved work, not just files.
 *   - Cleans up the timer + listener on unmount.
 *
 * A backup write assigns a backupId to the active tab (via the store) when it
 * lacks one, then persists `{ backupId, path, title, content, eol }` for that
 * tab (savedAt is stamped in the main process at write time).
 */
import { type RefObject, useCallback, useEffect, useRef } from 'react'
import { useEditorStore } from '@renderer/store/editorStore'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'

/** How long (ms) to wait after the last dirty change before writing a backup. */
const BACKUP_DEBOUNCE_MS = 5000

export function useCrashBackup(
  editorRef: RefObject<EditorPaneHandle | null>,
): void {
  // Write a backup of the active doc's CURRENT live buffer. Reads markdown the
  // same way persist does (the editor ref); reads path/title/eol from the
  // editor store (the live active-document state).
  const writeBackup = useCallback((): void => {
    if (!useEditorStore.getState().isDirty) return
    const activeId = useDocumentsStore.getState().activeId
    if (activeId === null) return
    const backupId = useDocumentsStore.getState().ensureBackupId(activeId)
    if (backupId === null) return
    const content = editorRef.current?.getMarkdown() ?? ''
    const { path, title, eol } = useEditorStore.getState()
    // savedAt is authoritative-stamped in the main process at write time; we
    // pass a placeholder to satisfy the BackupRecord shape (main overrides it).
    void window.lekha.writeBackup({ backupId, path, title, content, eol, savedAt: Date.now() })
  }, [editorRef])

  // Keep a stable ref to writeBackup so the effect does not re-run purely
  // because the callback identity changed.
  const writeRef = useRef(writeBackup)
  useEffect(() => {
    writeRef.current = writeBackup
  })

  // Debounce timer.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ----- Debounced backup write on dirty change -----------------------------
  //
  // We subscribe to the editor store IMPERATIVELY (store.subscribe) inside a
  // mount-only effect rather than via reactive selector hooks. The store's
  // markdown changes on EVERY keystroke (store.setMarkdown), so a reactive
  // `useEditorStore((s) => s.markdown)` selector would force the host component
  // (App) to re-render on every key press. Subscribing imperatively re-arms the
  // debounce timer entirely outside React's render cycle, so the backup still
  // tracks the live buffer continuously without any per-keystroke re-render.
  //
  // A backup write does NOT mark the doc clean (it is not a save), so keying off
  // isDirty alone would only ever fire the timer ONCE per dirty session;
  // re-arming on each store change (while dirty) keeps the 5s idle snapshot
  // tracking the latest content for the whole editing session.
  useEffect(() => {
    const arm = (): void => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      // Only schedule while the active document has unsaved changes.
      if (!useEditorStore.getState().isDirty) return
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        writeRef.current()
      }, BACKUP_DEBOUNCE_MS)
    }

    // Arm once for the current state (covers a doc already dirty on mount), then
    // re-arm on every subsequent store change.
    arm()
    const unsubscribe = useEditorStore.subscribe(arm)

    return () => {
      unsubscribe()
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  // ----- Flush backup on window blur ----------------------------------------

  useEffect(() => {
    const handleBlur = (): void => {
      if (!useEditorStore.getState().isDirty) return
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      writeRef.current()
    }

    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('blur', handleBlur)
    }
  }, [])
}
