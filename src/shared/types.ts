import type { Eol } from './eol'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

/** File metadata for File ▸ Get Info (sizes + timestamps in ms since epoch). */
export interface FileStat {
  sizeBytes: number
  birthtimeMs: number
  mtimeMs: number
  /**
   * File inode number. A rename/move keeps the inode, so it lets us recover the
   * new path of an open file that was renamed outside the app (see
   * verifyOpenFile). 0 when the platform does not report one.
   */
  inode: number
}

/**
 * Result of verifying an open document's path is still valid on disk:
 *   present  - the file is still at its path.
 *   renamed  - the file was renamed/moved within the same folder; newPath is the
 *              recovered location (matched by inode).
 *   missing  - the file is gone from its folder (moved elsewhere or deleted).
 */
export type OpenFileStatus =
  | { status: 'present' }
  | { status: 'renamed'; newPath: string }
  | { status: 'missing' }

/** A markdown file entry for the Articles/Library sidebar view. */
export interface ArticleEntry {
  path: string
  /** First `# ` heading, else the basename. */
  title: string
  mtimeMs: number
  sizeBytes: number
  /** Short body excerpt (~140 chars) for the list preview. */
  preview: string
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
  /**
   * Whether the theme renders on a dark or light background. Optional so the
   * many ThemeDef construction sites (e.g. the menu builder mapping UserTheme
   * to ThemeDef) need not always supply it. Consumers that care about the
   * light/dark nature (e.g. mermaidThemeFor) treat undefined as 'light'.
   */
  type?: 'dark' | 'light'
}

/**
 * A user-authored theme loaded at runtime from the userData/themes folder.
 * Extends the built-in ThemeDef with the theme's light/dark hint and its raw
 * CSS (a [data-theme="id"] token-override block), injected by the renderer.
 */
export interface UserTheme {
  id: string
  label: string
  type: 'dark' | 'light'
  css: string
}

/**
 * The canonical list of available themes.
 * Defined here (shared) so the main process (menu builder) and the renderer
 * (theme registry) both reference the same list without cross-boundary imports.
 * The renderer's src/renderer/themes/index.ts re-exports this for convenience.
 */
export const THEMES: ThemeDef[] = [
  { id: 'github',          label: 'GitHub',          type: 'light' },
  { id: 'night',           label: 'Night',           type: 'dark'  },
  { id: 'graphite',          label: 'Graphite',          type: 'dark'  },
  { id: 'sepia',           label: 'Sepia',           type: 'light' },
  { id: 'solarized-light', label: 'Solarized Light', type: 'light' },
  { id: 'solarized-dark',  label: 'Solarized Dark',  type: 'dark'  },
  { id: 'nord',            label: 'Nord',            type: 'dark'  },
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
  sidebarTab: 'files' | 'outline' | 'articles' | 'search'
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
   * Smart punctuation: convert straight quotes to curly, `...` to `…`, and `--`
   * to an em dash as you type. Applies to documents opened after a change.
   */
  smartPunctuation: boolean
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
  /**
   * Open document tabs to restore on launch: the file paths of saved tabs, in
   * display order. Unsaved (Untitled) tabs are not persisted.
   */
  openTabPaths: string[]
  /** Path of the tab that was active at last close (null when none/Untitled). */
  activeTabPath: string | null
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

/**
 * A document template: an id, human name, optional description, and starter
 * markdown content. Defined here (shared) so the main process, preload, and
 * renderer all reference the same type without cross-boundary imports.
 *
 * The registry content is pure/static. The {{date}} placeholder in the
 * daily-note template is substituted at insertion time by applyTemplate().
 */
export interface Template {
  id: string
  name: string
  description?: string
  content: string
}

/**
 * A crash-recovery backup of an unsaved document buffer. Written to app data
 * (never the user's real file) so unsaved work survives an app/OS crash.
 * Defined here (shared) so the main-process backup store and the preload bridge
 * both reference the same shape without cross-boundary imports.
 */
export interface BackupRecord {
  /** Stable id for this backup file (`<backupId>.json`), assigned per dirty tab. */
  backupId: string
  /** Original file path, or null for an Untitled (never-saved) document. */
  path: string | null
  title: string
  /** The unsaved markdown buffer. */
  content: string
  eol: Eol
  /** ms since epoch, stamped in the main process at write time. */
  savedAt: number
}
