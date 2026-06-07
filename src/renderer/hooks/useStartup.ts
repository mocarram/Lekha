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
import { useEditorStore } from '@renderer/store/editorStore'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import { applyTheme, applyFontSize } from '@renderer/themes/index'
import { setSmartPunctuation } from '@renderer/editor/createState'
import { clampSidebarWidth } from '@renderer/components/sidebarResizerUtils'
import type { FileOps } from './useFileOps'

// Debounce interval (ms) for persisting sidebar state changes.
const PERSIST_DEBOUNCE_MS = 300

/**
 * Apply persisted settings to the workspace store and set up persistence
 * subscriptions for sidebar state and last folder.
 *
 * @param fileOps - Used to restore previously open document tabs (openPath
 *   de-dupes + adds tabs; selectTab activates the last-active one).
 * @param onSidebarWidth - Called with the restored sidebar width (px) so App
 *   can update its sidebarWidth state and apply the CSS variable.
 */
export function useStartup(fileOps: FileOps, onSidebarWidth?: (px: number) => void): void {
  // Tracks whether we are currently in the initial restore phase.
  // Using a plain ref (not state) so changes to it never cause re-renders.
  const restoringRef = useRef(false)

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

      // Restore previously open document tabs (saved files only). Each path is
      // opened as a tab via fileOps.openPath (de-dupes + reuses the welcome
      // tab for the first file); missing/unreadable files are skipped. Then the
      // last-active tab is re-selected.
      if (s.openTabPaths.length > 0) {
        for (const p of s.openTabPaths) {
          try {
            await fileOpsRef.current.openPath(p)
          } catch {
            // File no longer exists or is not readable - skip silently.
          }
        }
        if (s.activeTabPath !== null) {
          const tab = useDocumentsStore
            .getState()
            .documents.find((d) => d.path === s.activeTabPath)
          if (tab) await fileOpsRef.current.selectTab(tab.id)
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
