import { create } from 'zustand'
import type { EditorMode } from '@shared/types'
import { type Eol, detectEol } from '@shared/eol'
import { deriveTitle } from '@shared/pathTitle'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * One open document tab. Holds a self-contained snapshot of a document so it
 * can be restored when its tab is re-activated. The currently-active tab's
 * *live* content is mirrored from editorStore (the active-document store);
 * inactive tabs keep their last snapshot here.
 */
export interface DocumentTab {
  /** Stable per-session id (never reused). */
  id: string
  /** Absolute file path, or null for an unsaved "Untitled" document. */
  path: string | null
  /** Display title (basename of path, or "Untitled"). */
  title: string
  /** Markdown snapshot. */
  markdown: string
  /** Whether the snapshot has unsaved changes. */
  isDirty: boolean
  /** Line-ending style detected/selected for this document. */
  eol: Eol
  /** WYSIWYG vs source editing mode for this document. */
  mode: EditorMode
  /** Inode of the file (rename-recovery); null for unsaved docs. */
  inode: number | null
  /**
   * Id of the crash-recovery backup file linked to this tab's unsaved buffer.
   * Assigned (via crypto.randomUUID) when the tab first writes a backup; null
   * while clean / never-edited. Cleared when the backup is removed (save/discard).
   */
  backupId: string | null
  /**
   * True for tabs restored from a backup after a crash; drives the inline
   * recovery banner. Defaults false for normally-opened/new tabs.
   */
  recovered: boolean
}

interface DocumentsState {
  /** Open tabs, left-to-right in display order. */
  documents: DocumentTab[]
  /** Id of the active tab, or null when no documents are open. */
  activeId: string | null
}

interface DocumentsActions {
  /**
   * Open a document. If a tab with the same (non-null) path is already open,
   * activate that existing tab instead of duplicating it. Returns the id of
   * the now-active tab.
   */
  openDocument(input: { path: string | null; markdown: string }): string
  /** Create a blank Untitled document, activate it, and return its id. */
  newDocument(): string
  /**
   * Close a tab. If the closed tab was active, activate a neighbour (the tab
   * to its left, falling back to the right; null when none remain).
   */
  closeDocument(id: string): void
  /** Make an existing tab active (no-op if the id is unknown). */
  activateDocument(id: string): void
  /**
   * Move the tab with `id` to `toIndex` in the strip order (drag-to-reorder).
   * The index is clamped; the active tab stays active (activation is
   * id-based, not order-based). No-op for unknown ids.
   */
  moveDocument(id: string, toIndex: number): void
  /** Patch the active tab in place (id cannot be changed). */
  updateActive(patch: Partial<Omit<DocumentTab, 'id'>>): void
  /**
   * Patch the tab with the given `id` in place (id cannot be changed). Mirrors
   * updateActive but targets a specific tab - used by the window-level save-all
   * / discard-all close flows, which mutate background tabs by id.
   */
  updateDocument(id: string, patch: Partial<Omit<DocumentTab, 'id'>>): void
  /**
   * Ensure the tab with `id` has a backupId, assigning a fresh
   * crypto.randomUUID() when missing. Returns the tab's backupId (existing or
   * newly assigned), or null when the id is unknown.
   */
  ensureBackupId(id: string): string | null
  /**
   * Rewrite the path (+ derived title) of any tab whose file was renamed/moved:
   * an exact path match, or a path under a renamed/moved containing folder.
   */
  updatePath(oldPath: string, newPath: string): void
  /** The active tab, or null. */
  activeDocument(): DocumentTab | null
  /** Reset to an empty session (clears tabs + id counter). */
  reset(): void
}

export type DocumentsStore = DocumentsState & DocumentsActions

// ---------------------------------------------------------------------------
// Id generation
// ---------------------------------------------------------------------------

let idCounter = 0
function genId(): string {
  idCounter += 1
  return `doc-${idCounter}`
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/**
 * Compute the next active id after removing `closingId` from `documents`.
 * Returns the neighbour to the left when available, otherwise the right, or
 * null when nothing remains. When the closing tab is not the active one, the
 * caller keeps the current active id (this helper assumes we are closing the
 * active tab).
 */
export function pickNeighbourId(
  documents: DocumentTab[],
  closingId: string,
): string | null {
  const idx = documents.findIndex((d) => d.id === closingId)
  if (idx === -1) return documents[0]?.id ?? null
  const remaining = documents.filter((d) => d.id !== closingId)
  if (remaining.length === 0) return null
  // Prefer the tab that was to the left (idx - 1); else the new tab at idx.
  const targetIdx = Math.min(Math.max(idx - 1, 0), remaining.length - 1)
  return remaining[targetIdx]!.id
}

/**
 * Id of the next/previous tab relative to `activeId`, cycling with wrap-around.
 * `dir` is +1 for next (right) and -1 for previous (left).
 *
 * Returns null when there are no documents; returns `activeId` unchanged when
 * there is a single tab (nothing to cycle to). When `activeId` is unknown it
 * falls back to the first/last tab depending on direction.
 */
export function nextTabId(
  documents: DocumentTab[],
  activeId: string | null,
  dir: 1 | -1,
): string | null {
  if (documents.length === 0) return null
  const idx = documents.findIndex((d) => d.id === activeId)
  if (idx === -1) return (dir === 1 ? documents[0]! : documents[documents.length - 1]!).id
  const n = documents.length
  const nextIdx = (idx + dir + n) % n
  return documents[nextIdx]!.id
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useDocumentsStore = create<DocumentsStore>()((set, get) => ({
  documents: [],
  activeId: null,

  openDocument({ path, markdown }) {
    // Re-activate an already-open file rather than duplicating it.
    if (path !== null) {
      const existing = get().documents.find((d) => d.path === path)
      if (existing) {
        set({ activeId: existing.id })
        return existing.id
      }
    }
    const tab: DocumentTab = {
      id: genId(),
      path,
      title: deriveTitle(path),
      markdown,
      isDirty: false,
      eol: detectEol(markdown),
      mode: 'wysiwyg',
      inode: null,
      backupId: null,
      recovered: false,
    }
    set((s) => ({ documents: [...s.documents, tab], activeId: tab.id }))
    return tab.id
  },

  newDocument() {
    const tab: DocumentTab = {
      id: genId(),
      path: null,
      title: 'Untitled',
      markdown: '',
      isDirty: false,
      eol: 'lf',
      mode: 'wysiwyg',
      inode: null,
      backupId: null,
      recovered: false,
    }
    set((s) => ({ documents: [...s.documents, tab], activeId: tab.id }))
    return tab.id
  },

  closeDocument(id) {
    const { documents, activeId } = get()
    const remaining = documents.filter((d) => d.id !== id)
    if (remaining.length === documents.length) return // unknown id, no-op
    const nextActive =
      activeId === id ? pickNeighbourId(documents, id) : activeId
    set({ documents: remaining, activeId: nextActive })
  },

  activateDocument(id) {
    if (get().documents.some((d) => d.id === id)) {
      set({ activeId: id })
    }
  },

  moveDocument(id, toIndex) {
    const docs = get().documents
    const from = docs.findIndex((d) => d.id === id)
    if (from === -1) return
    const to = Math.max(0, Math.min(toIndex, docs.length - 1))
    if (to === from) return
    const next = [...docs]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved!)
    set({ documents: next })
  },

  updateActive(patch) {
    const { activeId } = get()
    if (activeId === null) return
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === activeId ? { ...d, ...patch } : d,
      ),
    }))
  },

  updateDocument(id, patch) {
    set((s) => ({
      documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }))
  },

  ensureBackupId(id) {
    const tab = get().documents.find((d) => d.id === id)
    if (tab === undefined) return null
    if (tab.backupId !== null) return tab.backupId
    const backupId = crypto.randomUUID()
    set((s) => ({
      documents: s.documents.map((d) =>
        d.id === id ? { ...d, backupId } : d,
      ),
    }))
    return backupId
  },

  updatePath(oldPath, newPath) {
    set((s) => ({
      documents: s.documents.map((d) => {
        if (d.path === oldPath) {
          return { ...d, path: newPath, title: deriveTitle(newPath) }
        }
        // A containing folder was renamed/moved: rewrite the path prefix so
        // tabs of files under it keep pointing at the right (moved) location.
        if (d.path !== null && d.path.startsWith(oldPath + '/')) {
          const moved = newPath + d.path.slice(oldPath.length)
          return { ...d, path: moved, title: deriveTitle(moved) }
        }
        return d
      }),
    }))
  },

  activeDocument() {
    const { documents, activeId } = get()
    return documents.find((d) => d.id === activeId) ?? null
  },

  reset() {
    idCounter = 0
    set({ documents: [], activeId: null })
  },
}))
