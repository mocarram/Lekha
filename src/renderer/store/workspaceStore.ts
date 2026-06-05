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
  sidebarTab: 'files' | 'outline'
}

interface WorkspaceActions {
  setRootFolder(path: string | null): void
  setFileTree(tree: FileNode[]): void
  setRecentFiles(list: string[]): void
  toggleSidebar(): void
  setSidebarVisible(v: boolean): void
  setSidebarTab(tab: 'files' | 'outline'): void
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
}))
