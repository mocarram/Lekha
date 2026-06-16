import { useEffect, useRef } from 'react'
import type { FileNode } from '@shared/types'
import { useMenuPosition } from '@renderer/components/useMenuPosition'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What the context menu is targeting:
 *   - 'file'   - a file node: Rename / Delete / Reveal.
 *   - 'folder' - a directory node: + New File / New Folder (created inside it).
 *   - 'root'   - empty tree area / workspace root: only New File / New Folder.
 */
export type FileTreeMenuTarget =
  | { kind: 'file'; node: FileNode }
  | { kind: 'folder'; node: FileNode }
  | { kind: 'root'; node: null }

interface FileTreeMenuProps {
  target: FileTreeMenuTarget
  /** Fixed-position coordinates (clientX / clientY of the right-click). */
  x: number
  y: number
  /** New file inside `dir` (null = workspace root). */
  onNewFile: (dir: string | null) => void
  /** New folder inside `dir` (null = workspace root). */
  onNewFolder: (dir: string | null) => void
  /** Begin renaming the given node. */
  onRename: (node: FileNode) => void
  /** Delete (trash) the given node. */
  onDelete: (node: FileNode) => void
  /** Reveal the given path in the OS file manager. */
  onReveal: (path: string) => void
  /** Dismiss the menu (Escape, outside click, or after an action). */
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A small positioned popup menu for file-tree operations.
 *
 * Token-themed (uses --color-* vars, adapts to light + dark) and
 * keyboard-accessible: Escape closes it, and a click anywhere outside also
 * dismisses it. Action buttons are <button> elements for native a11y.
 *
 * The dir passed to New File / New Folder is the folder's own path (folder
 * target) or null for the workspace root - the caller resolves null to the
 * current rootFolder.
 */
export function FileTreeMenu({
  target,
  x,
  y,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
  onClose,
}: FileTreeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  // Keep the menu inside the viewport when opened near the right/bottom edge.
  const pos = useMenuPosition(menuRef, x, y)

  // Close on Escape (keyboard a11y) and on any outside pointer-down.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  // The directory new entries are created in: the folder itself, or null (root).
  const newEntryDir = target.kind === 'folder' ? target.node.path : null
  const showNew = target.kind === 'folder' || target.kind === 'root'
  const showEntryActions = target.kind === 'file' || target.kind === 'folder'

  return (
    <div
      ref={menuRef}
      className="filetree-menu"
      role="menu"
      style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
    >
      {showNew && (
        <>
          <button
            type="button"
            role="menuitem"
            className="filetree-menu__item"
            onClick={() => onNewFile(newEntryDir)}
          >
            New File
          </button>
          <button
            type="button"
            role="menuitem"
            className="filetree-menu__item"
            onClick={() => onNewFolder(newEntryDir)}
          >
            New Folder
          </button>
        </>
      )}

      {showEntryActions && target.node && (
        <>
          {showNew && <div className="filetree-menu__sep" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className="filetree-menu__item"
            onClick={() => onRename(target.node)}
          >
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className="filetree-menu__item filetree-menu__item--danger"
            onClick={() => onDelete(target.node)}
          >
            Delete
          </button>
          <div className="filetree-menu__sep" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="filetree-menu__item"
            onClick={() => onReveal(target.node.path)}
          >
            Reveal in Finder
          </button>
        </>
      )}
    </div>
  )
}
