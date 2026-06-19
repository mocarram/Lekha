import { useEffect } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { loadedDirPaths } from '@renderer/store/treeOps'

interface UseFolderWatcherDeps {
  /** Re-read one directory and patch it into the tree (from useFileOps). */
  loadChildren: (dir: string) => Promise<void>
}

/**
 * Keeps the main-process filesystem watcher pointed at this window's open root,
 * and applies live changes: when the watcher reports changed directories, each
 * one that is currently LOADED (or the root) is re-read in place. Collapsed /
 * unloaded directories are ignored - they read fresh when expanded.
 */
export function useFolderWatcher({ loadChildren }: UseFolderWatcherDeps): void {
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)

  // (a) Point the watcher at the current root (null = stop) whenever it changes.
  // Best-effort: the main handler may reject (disallowed path), so swallow.
  useEffect(() => {
    void window.lekha.watchFolder(rootFolder).catch(() => {})
  }, [rootFolder])

  // (b) Apply change notifications to loaded directories.
  useEffect(() => {
    const unsubscribe = window.lekha.onFolderChanged(({ dirs }) => {
      const state = useWorkspaceStore.getState()
      const root = state.rootFolder
      if (root === null) return
      const loaded = new Set(loadedDirPaths(state.fileTree))
      for (const dir of dirs) {
        if (dir === root || loaded.has(dir)) {
          void loadChildren(dir)
        }
      }
    })
    return unsubscribe
  }, [loadChildren])
}
