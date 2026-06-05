export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/**
 * A theme descriptor: an id used in the data-theme attribute and a display
 * label shown in the native Themes menu and any future UI.
 * Defined here (shared) so both the main-process menu builder and the
 * renderer theme registry can import it without cross-boundary imports.
 */
export interface ThemeDef {
  id: string
  label: string
}

/**
 * The canonical list of available themes.
 * Defined here (shared) so the main process (menu builder) and the renderer
 * (theme registry) both reference the same list without cross-boundary imports.
 * The renderer's src/renderer/themes/index.ts re-exports this for convenience.
 */
export const THEMES: ThemeDef[] = [
  { id: 'github', label: 'GitHub' },
  { id: 'night',  label: 'Night'  },
  { id: 'sepia',  label: 'Sepia'  },
]

export interface Settings {
  recentFiles: string[]
  lastFolder: string | null
  sidebarVisible: boolean
  sidebarTab: 'files' | 'outline'
  windowBounds?: { x: number; y: number; width: number; height: number }
  /** Active theme id (corresponds to a ThemeDef id in the renderer theme registry). */
  theme: string
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
