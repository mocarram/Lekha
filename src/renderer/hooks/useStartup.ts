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
import { useEffect, useRef } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import type { FileOps } from './useFileOps'

// Debounce interval (ms) for persisting sidebar state changes.
const PERSIST_DEBOUNCE_MS = 300

/**
 * Apply persisted settings to the workspace store and set up persistence
 * subscriptions for sidebar state and last folder.
 *
 * @param _fileOps - Reserved for future use (e.g. openPath on restored recents).
 *   Currently unused; folder restore uses window.lekha.readDir directly.
 */
export function useStartup(_fileOps: FileOps): void {
  // Tracks whether we are currently in the initial restore phase.
  // Using a plain ref (not state) so changes to it never cause re-renders.
  const restoringRef = useRef(false)

  // Debounce timer for sidebar-state persistence.
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

      // Restore last folder if one was persisted. A missing/deleted folder
      // is silently ignored to avoid noisy startup errors.
      if (s.lastFolder !== null) {
        try {
          const tree = await window.lekha.readDir(s.lastFolder)
          useWorkspaceStore.getState().setRootFolder(s.lastFolder)
          useWorkspaceStore.getState().setFileTree(tree)
        } catch {
          // Folder no longer exists or is not readable - skip silently.
        }
      }

      // Restore phase is complete. Future store changes should be persisted.
      restoringRef.current = false
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

      // Persist last-open folder change.
      if (state.rootFolder !== prev.rootFolder) {
        void window.lekha.setSettings({ lastFolder: state.rootFolder })
      }
    })

    return () => {
      unsubscribe()
      if (sidebarTimerRef.current !== null) {
        clearTimeout(sidebarTimerRef.current)
        sidebarTimerRef.current = null
      }
    }
    // Empty deps: subscribe once on mount, unsubscribe on unmount.
    // The store subscription always sees the latest state via zustand's callback.
  }, [])
}
