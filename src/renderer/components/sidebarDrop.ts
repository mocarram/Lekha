/**
 * sidebarDrop.ts - classify OS files/folders dropped onto the Files sidebar.
 *
 * Splits a DataTransfer into absolute folder paths and file paths. Directory
 * detection uses webkitGetAsEntry().isDirectory (available on the drag items);
 * the absolute path comes from Electron's webUtils via window.lekha
 * .getPathForFile (File.path was removed in modern Electron).
 */
import { isOpenablePath } from '@shared/openable'

/** Subset of FileSystemEntry we rely on (jsdom lacks the full type). */
interface DropEntry {
  isDirectory: boolean
}

interface DropItem {
  kind: string
  getAsFile(): File | null
  webkitGetAsEntry?: () => DropEntry | null
}

export interface ClassifiedDrop {
  /** Absolute paths of dropped directories. */
  folders: string[]
  /** Absolute paths of dropped files. */
  files: string[]
}

/** Resolve a dropped File's absolute path via the preload bridge. '' on failure. */
function pathFor(file: File | null): string {
  if (!file) return ''
  try {
    return window.lekha.getPathForFile(file) ?? ''
  } catch {
    return ''
  }
}

/**
 * Classify a drop's items into folder paths and file paths. Prefers the
 * `items` API (so directories can be distinguished); falls back to `files`
 * (treating everything as a file) when items are unavailable.
 */
export function classifyDrop(dt: DataTransfer | null): ClassifiedDrop {
  const folders: string[] = []
  const files: string[] = []
  if (!dt) return { folders, files }

  const items = dt.items as unknown as ArrayLike<DropItem> | undefined
  if (items && items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      if (item.kind !== 'file') continue
      const path = pathFor(item.getAsFile())
      if (!path) continue
      const entry = item.webkitGetAsEntry?.() ?? null
      if (entry?.isDirectory) folders.push(path)
      else files.push(path)
    }
    return { folders, files }
  }

  for (let i = 0; i < dt.files.length; i++) {
    const path = pathFor(dt.files.item(i))
    if (path) files.push(path)
  }
  return { folders, files }
}

/** True when a drag carries OS files (so we should show the drop affordance). */
export function dragHasFiles(dt: DataTransfer | null): boolean {
  if (!dt) return false
  return Array.from(dt.types).includes('Files')
}

/**
 * True when a file drag is an "open" drag (a folder or a non-image file) rather
 * than an image-insert drag. Folders report an empty MIME type, images report
 * `image/*`; so any dragged file item whose type is not `image/*` means "open".
 * Used by the editor-area drop target to intercept open-drops in the capture
 * phase while letting image drops fall through to the editor's image insertion.
 */
export function dragIsOpenType(dt: DataTransfer | null): boolean {
  if (dt === null || !dragHasFiles(dt)) return false
  const items = dt.items
  if (!items || items.length === 0) return true // unknown -> assume open
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (item.kind === 'file' && !item.type.startsWith('image/')) return true
  }
  return false
}

/**
 * True when a file drag could be a FOLDER (so the sidebar - which only accepts
 * folders - should show its drop affordance). Folders report an empty MIME
 * type; a drag whose items ALL have an empty type might be folder(s) or
 * extension-less files, while any item with a real MIME type (image/png,
 * application/pdf, text/plain, ...) is definitely a file. We can only narrow,
 * not perfectly detect, because the OS does not expose isDirectory until drop.
 */
export function dragMaybeFolder(dt: DataTransfer | null): boolean {
  if (dt === null || !dragHasFiles(dt)) return false
  const items = dt.items
  if (!items || items.length === 0) return true
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!
    if (item.kind === 'file' && item.type !== '') return false
  }
  return true
}

/** Keep only files the editor can open as text tabs (markdown + plain text). */
export function openableFiles(paths: string[]): string[] {
  return paths.filter(isOpenablePath)
}
