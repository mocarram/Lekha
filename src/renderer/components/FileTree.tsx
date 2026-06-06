import { useState, useRef, useEffect } from 'react'
import type { FileNode } from '@shared/types'
import { FileTreeMenu, type FileTreeMenuTarget } from './FileTreeMenu'

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
 * Directories track their own expanded/collapsed state locally. Children are
 * rendered recursively when expanded. Files call onSelect when clicked.
 * Right-click opens the shared context menu via onContextMenu.
 */
function FileTreeNode({
  node,
  activePath,
  onSelect,
  depth,
  renamingPath,
  onContextMenu,
  onRenameCommit,
  onRenameCancel,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)

  const isActive = node.path === activePath
  const isRenaming = node.path === renamingPath

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded((prev) => !prev)
    } else {
      onSelect(node.path)
    }
  }

  return (
    <div className="file-tree__node" style={{ paddingLeft: `${depth * 12}px` }}>
      <div
        className={`file-tree__row${isActive ? ' active' : ''}${node.isDirectory ? ' file-tree__row--dir' : ' file-tree__row--file'}`}
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick()
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
      >
        {node.isDirectory && (
          <span className="file-tree__arrow" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
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
