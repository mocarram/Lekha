import { useState } from 'react'
import type { FileNode } from '@shared/types'

// ---------------------------------------------------------------------------
// Subcomponent: a single node (file or directory) in the tree
// ---------------------------------------------------------------------------

interface FileTreeNodeProps {
  node: FileNode
  activePath: string | null
  onSelect: (path: string) => void
  depth: number
}

/**
 * Renders a single FileNode row.
 *
 * Directories track their own expanded/collapsed state locally. Children are
 * rendered recursively when expanded. Files call onSelect when clicked.
 */
function FileTreeNode({ node, activePath, onSelect, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)

  const isActive = node.path === activePath

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
        role={node.isDirectory ? 'button' : 'button'}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick()
        }}
      >
        {node.isDirectory && (
          <span className="file-tree__arrow" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span className="file-tree__name">{node.name}</span>
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
}

/**
 * FileTree renders a recursive, expandable file-system tree.
 *
 * Only top-level nodes are passed in; each FileTreeNode handles its own
 * children when expanded. Keys are file paths which must be unique.
 */
export function FileTree({ nodes, activePath, onSelect }: FileTreeProps) {
  return (
    <div className="file-tree">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          activePath={activePath}
          onSelect={onSelect}
          depth={0}
        />
      ))}
    </div>
  )
}
