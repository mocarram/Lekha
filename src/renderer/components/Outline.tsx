import { useState } from 'react'
import type { OutlineItem } from '@shared/types'
import { buildOutlineTree, type OutlineNode } from '../editor/outline'

interface OutlineProps {
  /** Ordered list of heading items extracted from the current document. */
  items: OutlineItem[]
  /** Called with the heading's document position when the user clicks it. */
  onJump: (pos: number) => void
}

interface OutlineNodeRowProps {
  node: OutlineNode
  /** Set of collapsed heading positions (shared across the tree). */
  collapsed: Set<number>
  onToggle: (pos: number) => void
  onJump: (pos: number) => void
}

/**
 * Render one outline node and (when expanded) its children recursively.
 *
 * A node with children gets a clickable chevron that toggles its collapsed
 * state without jumping. Clicking the label always jumps to the heading. The
 * label is indented by level so the structure reads visually even when the
 * chevron column is empty (leaf nodes).
 */
function OutlineNodeRow({ node, collapsed, onToggle, onJump }: OutlineNodeRowProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(node.pos)

  return (
    <div className="outline__node">
      <div className="outline__row">
        {hasChildren ? (
          <button
            type="button"
            className={`outline__chevron${isCollapsed ? ' outline__chevron--collapsed' : ''}`}
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
            aria-expanded={!isCollapsed}
            // Stop propagation so the click toggles collapse but does not jump.
            onClick={(e) => {
              e.stopPropagation()
              onToggle(node.pos)
            }}
          >
            ▾
          </button>
        ) : (
          <span className="outline__chevron-spacer" aria-hidden="true" />
        )}
        <span
          className="outline__item"
          style={{ paddingLeft: `${(node.level - 1) * 12}px` }}
          role="button"
          tabIndex={0}
          onClick={() => onJump(node.pos)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onJump(node.pos)
          }}
        >
          {node.text}
        </span>
      </div>
      {hasChildren && !isCollapsed && (
        <div className="outline__children">
          {node.children.map((child) => (
            <OutlineNodeRow
              key={`${child.pos}-${child.text}`}
              node={child}
              collapsed={collapsed}
              onToggle={onToggle}
              onJump={onJump}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Outline renders the document's heading hierarchy as a collapsible tree.
 *
 * The flat heading list from getOutline is nested by level via
 * buildOutlineTree. Each node with children shows a chevron that collapses /
 * expands its descendants (tracked in a pos-keyed Set, default expanded).
 * Clicking a label calls onJump(pos) so the editor scrolls to that heading.
 *
 * When the document has no headings, a muted "No headings" placeholder is
 * shown instead of an empty panel.
 */
export function Outline({ items, onJump }: OutlineProps) {
  // Collapsed nodes tracked by heading position. Default: everything expanded.
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set())

  const toggle = (pos: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(pos)) next.delete(pos)
      else next.add(pos)
      return next
    })
  }

  const tree = buildOutlineTree(items)

  return (
    <div className="outline">
      {tree.length === 0 ? (
        <p className="outline__empty">No headings</p>
      ) : (
        tree.map((node) => (
          <OutlineNodeRow
            key={`${node.pos}-${node.text}`}
            node={node}
            collapsed={collapsed}
            onToggle={toggle}
            onJump={onJump}
          />
        ))
      )}
    </div>
  )
}
