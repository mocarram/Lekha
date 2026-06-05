export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface Settings {
  recentFiles: string[]
  lastFolder: string | null
  sidebarVisible: boolean
  sidebarTab: 'files' | 'outline'
  windowBounds?: { x: number; y: number; width: number; height: number }
}

export type EditorMode = 'wysiwyg' | 'source'

export interface OutlineItem {
  level: number
  text: string
  pos: number
}

export interface DocCounts {
  words: number
  chars: number
}

export interface DocumentState {
  title: string
  dirty: boolean
  path: string | null
}
