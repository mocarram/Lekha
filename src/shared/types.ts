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
  /** Focus mode: dims non-active top-level blocks so only the focused block is full-opacity. */
  focusMode: boolean
  /** Typewriter mode: keeps the cursor line vertically centered in the editor viewport. */
  typewriterMode: boolean
  /** Editor content font size in pixels. Applied via the --editor-font-size CSS var. */
  fontSize: number
  /** Auto-save: automatically write saved documents after a short idle period. */
  autoSave: boolean
  /** Spell check: enable the Electron/Chromium native spell-checker underlines. */
  spellCheck: boolean
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
