import { useState, useRef, useEffect } from 'react'
import type { FileNode } from '@shared/types'
import { FileTreeMenu, type FileTreeMenuTarget } from './FileTreeMenu'

// ---------------------------------------------------------------------------
// Row icons (monochrome, inherit currentColor so they tint with the row)
// ---------------------------------------------------------------------------

/** Filled folder glyph shown on directory rows. */
function FolderIcon() {
  return (
    <svg
      className="file-tree__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.75 2.5h3.32c.27 0 .53.11.72.3l.86.86c.06.06.13.09.21.09h7.39c.41 0 .75.34.75.75v8.5c0 .41-.34.75-.75.75H1.75A.75.75 0 0 1 1 13V3.25c0-.41.34-.75.75-.75z" />
    </svg>
  )
}

/** Outlined document glyph (with a folded corner) shown on file rows. */
function FileIcon() {
  return (
    <svg
      className="file-tree__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 1.75h5l3 3V14a.25.25 0 0 1-.25.25h-7.5A.25.25 0 0 1 4 14V2a.25.25 0 0 1 .25-.25z" />
      <path d="M9 1.75V5h3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Inline rename input
// ---------------------------------------------------------------------------

interface RenameInputProps {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}

/**
 * The in-row rename editor. Enter commits the trimmed value (no-op if unchanged
 * or empty); Escape cancels; blur cancels (avoids committing a stray edit).
 * Autofocuses and selects the basename so the extension is easy to keep.
 */
function RenameInput({ initial, onCommit, onCancel }: RenameInputProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Select the basename (everything before the last dot) so typing replaces
    // the name but keeps the extension by default.
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])

  const commit = () => {
    const value = ref.current?.value.trim() ?? ''
    if (value.length === 0 || value === initial) {
      onCancel()
      return
    }
    onCommit(value)
  }

  return (
    <input
      ref={ref}
      className="file-tree__rename-input"
      defaultValue={initial}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCancel}
    />
  )
}

// ---------------------------------------------------------------------------
// Subcomponent: a single node (file or directory) in the tree
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
  node: FileNode
  activePath: string | null
  onSelect: (path: string) => void
  depth: number
  /** Set of expanded directory paths (lifted to the root so it survives tree
   *  refreshes and can be driven programmatically for auto-reveal). */
  expandedPaths: Set<string>
  /** Toggle a directory's expanded state. */
  onToggleExpand: (path: string) => void
  /** Path currently being renamed inline (null when none). */
  renamingPath: string | null
  /** Open the context menu for a node at the given client coordinates. */
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
  /** Commit / cancel for the inline rename input. */
  onRenameCommit: (oldPath: string, newName: string) => void
  onRenameCancel: () => void
}

/**
 * Renders a single FileNode row.
 *
 * Expanded/collapsed state lives in a shared Set keyed by absolute path (held
 * at the FileTree root), so it persists across tree refreshes and lets the tree
 * auto-expand ancestors to reveal the active file. Files call onSelect when
 * clicked. Right-click opens the shared context menu via onContextMenu.
 */
function FileTreeNode({
  node,
  activePath,
  onSelect,
  depth,
  expandedPaths,
  onToggleExpand,
  renamingPath,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: FileTreeNodeProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const expanded = expandedPaths.has(node.path)
  const isActive = node.path === activePath
  const isRenaming = node.path === renamingPath

  // Scroll the active file's row into view when it becomes active (e.g. opened
  // from Open Recent, search, or a link in a collapsed-then-revealed folder).
  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isActive])

  const handleClick = () => {
    if (node.isDirectory) {
      onToggleExpand(node.path)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <div className="file-tree__node" style={{ paddingLeft: `${depth * 12}px` }}>
      <div
        ref={rowRef}
        className={`file-tree__row${isActive ? ' active' : ''}${node.isDirectory ? ' file-tree__row--dir' : ' file-tree__row--file'}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick()
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {node.isDirectory ? (
          <span
            className={`file-tree__arrow${expanded ? '' : ' file-tree__arrow--collapsed'}`}
            aria-hidden="true"
          >
            ▾
          </span>
        ) : (
          <span className="file-tree__arrow-spacer" aria-hidden="true" />
        )}
        {node.isDirectory ? <FolderIcon /> : <FileIcon />}
        {isRenaming ? (
          <RenameInput
            initial={node.name}
            onCommit={(name) => onRenameCommit(node.path, name)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="file-tree__name">{node.name}</span>
        )}
      </div>

      {node.isDirectory && expanded && node.children && (
        <div className="file-tree__children">
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              activePath={activePath}
              onSelect={onSelect}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              onToggleExpand={onToggleExpand}
              renamingPath={renamingPath}
              onContextMenu={onContextMenu}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

interface FileTreeProps {
  /** The nodes to render (top-level of the workspace file tree). */
  nodes: FileNode[]
  /** The path of the currently open file; that row gets an 'active' class. */
  activePath: string | null
  /** Called with the path when a file node is clicked. */
  onSelect: (path: string) => void
  /**
   * Create a new file in `dir` (null = workspace root). The handler should
   * create the entry then refresh the tree. Optional so simpler call sites
   * (and existing tests) can render a read-only tree.
   */
  onNewFile?: (dir: string | null) => void | Promise<void>
  /** Create a new folder in `dir` (null = workspace root). */
  onNewFolder?: (dir: string | null) => void | Promise<void>
  /** Rename `oldPath` to `newName` (same parent dir), then refresh. */
  onRename?: (oldPath: string, newName: string) => void | Promise<void>
  /** Delete (trash) `path`, then refresh. */
  onDelete?: (path: string) => void | Promise<void>
  /** Reveal `path` in the OS file manager. */
  onReveal?: (path: string) => void
}

interface MenuState {
  target: FileTreeMenuTarget
  x: number
  y: number
}

/**
 * FileTree renders a recursive, expandable file-system tree with a right-click
 * context menu for create / rename / delete / reveal operations.
 *
 * Only top-level nodes are passed in; each FileTreeNode handles its own
 * children when expanded. The context menu and inline-rename state live here at
 * the root so a single menu/input is active at a time. All mutating actions are
 * delegated to the optional callback props (the caller wires them to
 * window.lekha + refreshTree); when a callback is absent the action is a no-op.
 */
export function FileTree({
  nodes,
  activePath,
  onSelect,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onReveal,
}: FileTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  // Expanded directory paths, keyed by absolute path. Lifted here (not per-node)
  // so the state survives a tree refresh after create/rename/delete and so we
  // can auto-expand ancestors to reveal the active file.
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  // Auto-reveal: the active file's ancestor folders are always shown so the
  // highlighted row is reachable. Derived purely during render by unioning the
  // user-toggled set with the active path's ancestor directories (its
  // successive parent paths) - no effect/ref/setState, so it stays lint-clean
  // and the highlighted file is always revealed wherever it lives.
  const effectiveExpanded = (() => {
    if (!activePath) return expandedPaths
    const merged = new Set(expandedPaths)
    const parts = activePath.split('/')
    for (let i = parts.length - 1; i > 0; i--) {
      const ancestor = parts.slice(0, i).join('/')
      if (ancestor) merged.add(ancestor)
    }
    return merged
  })()

  const openMenu = (e: React.MouseEvent, target: FileTreeMenuTarget) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ target, x: e.clientX, y: e.clientY })
  }

  const closeMenu = () => setMenu(null)

  // Right-click on a node row.
  const handleNodeContextMenu = (e: React.MouseEvent, node: FileNode) => {
    openMenu(e, { kind: node.isDirectory ? 'folder' : 'file', node })
  }

  // Right-click on the empty tree area / root.
  const handleRootContextMenu = (e: React.MouseEvent) => {
    openMenu(e, { kind: 'root', node: null })
  }

  return (
    <div className="file-tree" onContextMenu={handleRootContextMenu}>
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          activePath={activePath}
          onSelect={onSelect}
          depth={0}
          expandedPaths={effectiveExpanded}
          onToggleExpand={toggleExpand}
          renamingPath={renamingPath}
          onContextMenu={handleNodeContextMenu}
          onRenameCommit={(oldPath, newName) => {
            setRenamingPath(null)
            void onRename?.(oldPath, newName)
          }}
          onRenameCancel={() => setRenamingPath(null)}
        />
      ))}

      {menu && (
        <FileTreeMenu
          target={menu.target}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onNewFile={(dir) => {
            closeMenu()
            void onNewFile?.(dir)
          }}
          onNewFolder={(dir) => {
            closeMenu()
            void onNewFolder?.(dir)
          }}
          onRename={(node) => {
            closeMenu()
            setRenamingPath(node.path)
          }}
          onDelete={(node) => {
            closeMenu()
            void onDelete?.(node.path)
          }}
          onReveal={(path) => {
            closeMenu()
            onReveal?.(path)
          }}
        />
      )}
    </div>
  )
}
