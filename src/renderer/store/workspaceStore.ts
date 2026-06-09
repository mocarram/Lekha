import { create } from 'zustand'
import type { FileNode } from '@shared/types'

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
}

interface WorkspaceActions {
  setRootFolder(path: string | null): void
  setFileTree(tree: FileNode[]): void
  setRecentFiles(list: string[]): void
  toggleSidebar(): void
  setSidebarVisible(v: boolean): void
  setSidebarTab(tab: 'files' | 'outline' | 'articles' | 'search'): void
  toggleStatusBar(): void
  setAlwaysOnTop(v: boolean): void
  setSearchQuery(q: string): void
  setSearchCaseSensitive(v: boolean): void
  setSearchWholeWord(v: boolean): void
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

  setRootFolder(path) {
    set({ rootFolder: path })
  },

  setFileTree(tree) {
    set({ fileTree: tree })
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
}))
