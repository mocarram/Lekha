import { create } from 'zustand'
import type { EditorMode, OutlineItem, DocCounts } from '@shared/types'
import { type Eol, detectEol } from '@shared/eol'
import { deriveTitle } from '@shared/pathTitle'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EditorState {
  path: string | null
  title: string
  isDirty: boolean
  mode: EditorMode
  markdown: string
  outline: OutlineItem[]
  wordCount: number
  charCount: number
  /** Words in the current selection (0 when the selection is empty). */
  selWords: number
  /** Characters in the current selection (0 when the selection is empty). */
  selChars: number
  /** Focus mode: dims non-active top-level blocks (gated by CSS container class). */
  focusMode: boolean
  /** Typewriter mode: keeps the cursor line vertically centered in the viewport. */
  typewriterMode: boolean
  /** Equation numbering: CSS-only auto-numbering of block math (gated by container class). */
  equationNumbering: boolean
  /** Auto-save: automatically write saved documents after a short idle period. */
  autoSave: boolean
  /** Per-document line-ending style; detected on open, applied on save. */
  eol: Eol
}

interface EditorActions {
  /** Load a file: set path, derive title, replace markdown, clear dirty. */
  openFile(path: string | null, markdown: string): void
  /** Create a new blank document. */
  newFile(): void
  setMode(mode: EditorMode): void
  setMarkdown(md: string): void
  setOutline(items: OutlineItem[]): void
  setCounts(counts: DocCounts): void
  /** Update the selection word/char counts (0/0 clears the selection display). */
  setSelectionCounts(counts: DocCounts): void
  markDirty(): void
  markClean(): void
  /** Update path and re-derive title. */
  setPath(path: string | null): void
  /** Return all state to initial defaults. */
  reset(): void
  /** Toggle focus mode on/off. */
  toggleFocusMode(): void
  /** Toggle typewriter mode on/off. */
  toggleTypewriterMode(): void
  /** Set focus mode to an explicit value. */
  setFocusMode(value: boolean): void
  /** Set typewriter mode to an explicit value. */
  setTypewriterMode(value: boolean): void
  /** Set the document's line-ending style. */
  setEol(eol: Eol): void
  /** Set equation numbering to an explicit value. */
  setEquationNumbering(value: boolean): void
  /** Set auto-save to an explicit value. */
  setAutoSave(value: boolean): void
}

export type EditorStore = EditorState & EditorActions

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Title derivation lives in @shared/pathTitle (shared with documentsStore).

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE: EditorState = {
  path: null,
  title: 'Untitled',
  isDirty: false,
  mode: 'wysiwyg',
  markdown: '',
  outline: [],
  wordCount: 0,
  charCount: 0,
  selWords: 0,
  selChars: 0,
  focusMode: false,
  typewriterMode: false,
  equationNumbering: true,
  autoSave: true,
  eol: 'lf',
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEditorStore = create<EditorStore>()((set) => ({
  ...INITIAL_STATE,

  openFile(path, markdown) {
    set({
      path,
      title: deriveTitle(path),
      markdown,
      isDirty: false,
      mode: 'wysiwyg',
      eol: detectEol(markdown),
    })
  },

  newFile() {
    set({ ...INITIAL_STATE })
  },

  setMode(mode) {
    set({ mode })
  },

  setMarkdown(md) {
    set({ markdown: md })
  },

  setOutline(items) {
    set({ outline: items })
  },

  setCounts({ words, chars }) {
    set({ wordCount: words, charCount: chars })
  },

  setSelectionCounts({ words, chars }) {
    set({ selWords: words, selChars: chars })
  },

  markDirty() {
    set({ isDirty: true })
  },

  markClean() {
    set({ isDirty: false })
  },

  setPath(path) {
    set({ path, title: deriveTitle(path) })
  },

  reset() {
    set({ ...INITIAL_STATE })
  },

  toggleFocusMode() {
    set((s) => ({ focusMode: !s.focusMode }))
  },

  toggleTypewriterMode() {
    set((s) => ({ typewriterMode: !s.typewriterMode }))
  },

  setFocusMode(value) {
    set({ focusMode: value })
  },

  setTypewriterMode(value) {
    set({ typewriterMode: value })
  },

  setEquationNumbering(value) {
    set({ equationNumbering: value })
  },

  setAutoSave(value) {
    set({ autoSave: value })
  },

  setEol(eol) {
    set({ eol })
  },
}))
