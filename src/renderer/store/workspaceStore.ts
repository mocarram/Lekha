import { create } from 'zustand'
import type { FileNode } from '@shared/types'
import { mergePreserveLoaded, setNodeChildren } from './treeOps'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WorkspaceState {
  rootFolder: string | null
  fileTree: FileNode[]
  recentFiles: string[]
  sidebarVisible: boolean
  sidebarTab: 'files' | 'outline' | 'articles' | 'search'
  /** Whether the bottom status bar is shown (View ▸ Toggle Status Bar). */
  showStatusBar: boolean
  /** Whether the window floats above others (View ▸ Always on Top). */
  alwaysOnTop: boolean
  /**
   * Folder-search query + case flag. Held here (not in FolderSearch's local
   * state) so they survive the sidebar being collapsed - which unmounts the
   * panel - and the query is restored (and re-run) when it reopens.
   */
  searchQuery: string
  searchCaseSensitive: boolean
  searchWholeWord: boolean
  searchReplaceText: string
  /**
   * This window's marker color (a `#rrggbb` hex), or null for none. Drives the
   * top color rail. For a window with a folder open it mirrors that folder's
   * persisted color; for a folderless scratch window it is ephemeral.
   */
  windowColor: string | null
}

interface WorkspaceActions {
  setRootFolder(path: string | null): void
  setFileTree(tree: FileNode[]): void
  /**
   * Replace the children of the directory at `path` (merging to preserve
   * already-loaded descendants). When `path` is the open root folder, replaces
   * the top-level tree. No-op when no node matches.
   */
  setChildren(path: string, children: FileNode[]): void
  setRecentFiles(list: string[]): void
  toggleSidebar(): void
  setSidebarVisible(v: boolean): void
  setSidebarTab(tab: 'files' | 'outline' | 'articles' | 'search'): void
  toggleStatusBar(): void
  setAlwaysOnTop(v: boolean): void
  setSearchQuery(q: string): void
  setSearchCaseSensitive(v: boolean): void
  setSearchWholeWord(v: boolean): void
  setSearchReplaceText(v: string): void
  setWindowColor(hex: string | null): void
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkspaceStore = create<WorkspaceStore>()((set, get) => ({
  // Initial state
  rootFolder: null,
  fileTree: [],
  recentFiles: [],
  sidebarVisible: true,
  sidebarTab: 'files',
  showStatusBar: true,
  alwaysOnTop: false,
  searchQuery: '',
  searchCaseSensitive: false,
  searchWholeWord: false,
  searchReplaceText: '',
  windowColor: null,

  setRootFolder(path) {
    set({ rootFolder: path })
  },

  setFileTree(tree) {
    set({ fileTree: tree })
  },

  setChildren(path, children) {
    set((state) => {
      if (path === state.rootFolder) {
        return { fileTree: mergePreserveLoaded(state.fileTree, children) }
      }
      return { fileTree: setNodeChildren(state.fileTree, path, children) }
    })
  },

  setRecentFiles(list) {
    set({ recentFiles: list })
  },

  toggleSidebar() {
    set({ sidebarVisible: !get().sidebarVisible })
  },

  setSidebarVisible(v) {
    set({ sidebarVisible: v })
  },

  setSidebarTab(tab) {
    set({ sidebarTab: tab })
  },

  toggleStatusBar() {
    set({ showStatusBar: !get().showStatusBar })
  },

  setAlwaysOnTop(v) {
    set({ alwaysOnTop: v })
  },

  setSearchQuery(q) {
    set({ searchQuery: q })
  },

  setSearchCaseSensitive(v) {
    set({ searchCaseSensitive: v })
  },

  setSearchWholeWord(v) {
    set({ searchWholeWord: v })
  },

  setSearchReplaceText(v) {
    set({ searchReplaceText: v })
  },

  setWindowColor(hex) {
    set({ windowColor: hex })
  },
}))
