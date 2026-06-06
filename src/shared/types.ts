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
  { id: 'github',          label: 'GitHub'         },
  { id: 'night',           label: 'Night'          },
  { id: 'sepia',           label: 'Sepia'          },
  { id: 'solarized-light', label: 'Solarized Light' },
  { id: 'solarized-dark',  label: 'Solarized Dark'  },
  { id: 'nord',            label: 'Nord'            },
]

/** A single line match inside a file during folder-wide search. */
export interface FolderSearchMatch {
  lineNumber: number
  lineText: string
}

/** Per-file result grouping returned by the searchFolder IPC handler. */
export interface FolderSearchResult {
  filePath: string
  fileName: string
  matches: FolderSearchMatch[]
}

export interface Settings {
  recentFiles: string[]
  lastFolder: string | null
  sidebarVisible: boolean
  sidebarTab: 'files' | 'outline' | 'search'
  windowBounds?: { x: number; y: number; width: number; height: number }
  /** Active theme id (corresponds to a ThemeDef id in the renderer theme registry). */
  theme: string
  /** Focus mode: dims non-active top-level blocks so only the focused block is full-opacity. */
  focusMode: boolean
  /** Typewriter mode: keeps the cursor line vertically centered in the editor viewport. */
  typewriterMode: boolean
  /**
   * Equation numbering: show auto-incrementing `(n)` numbers on the right of
   * each block math equation (CSS counter only - never mutates the document).
   */
  equationNumbering: boolean
  /** Editor content font size in pixels. Applied via the --editor-font-size CSS var. */
  fontSize: number
  /** Auto-save: automatically write saved documents after a short idle period. */
  autoSave: boolean
  /** Spell check: enable the Electron/Chromium native spell-checker underlines. */
  spellCheck: boolean
  /**
   * Sidebar width in pixels. Persisted so the resized width survives restarts.
   * Clamped to [SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH] on restore.
   */
  sidebarWidth: number
  /**
   * BCP-47 language tag for the spell-checker (e.g. 'en-US', 'fr').
   * Applied via session.setSpellCheckerLanguages.
   */
  spellCheckLanguage: string
}

/** Default editor font size (px). Shared by the settings store and the renderer. */
export const DEFAULT_FONT_SIZE = 16

/** Allowed editor font-size range (px) shown in Preferences. */
export const MIN_FONT_SIZE = 12
export const MAX_FONT_SIZE = 24

export type EditorMode = 'wysiwyg' | 'source'

/**
 * Pandoc export formats supported by the generalized export handler. Shared so
 * the renderer, preload, and main process all reference the same union without
 * cross-boundary imports. The main process owns the writer/extension mapping.
 */
export type PandocFormat = 'docx' | 'epub' | 'rtf' | 'latex' | 'opml'

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
