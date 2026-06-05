import type { OutlineItem } from '@shared/types'

interface OutlineProps {
  /** Ordered list of heading items extracted from the current document. */
  items: OutlineItem[]
  /** Called with the heading's document position when the user clicks it. */
  onJump: (pos: number) => void
}

/**
 * Outline renders the document's heading hierarchy as a clickable list.
 *
 * Each item is indented proportionally to its heading level using inline
 * paddingLeft so that the structure is visually apparent. Clicking an item
 * calls onJump(item.pos) so the editor can scroll to that heading.
 *
 * When the document has no headings, a muted "No headings" placeholder is
 * shown instead of an empty panel.
 */
export function Outline({ items, onJump }: OutlineProps) {
  return (
    <div className="outline">
      {items.length === 0 ? (
        <p className="outline__empty">No headings</p>
      ) : (
        items.map((item) => (
          <div
            key={`${item.pos}-${item.text}`}
            className="outline__item"
            style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
            role="button"
            tabIndex={0}
            onClick={() => onJump(item.pos)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onJump(item.pos)
            }}
          >
            {item.text}
          </div>
        ))
      )}
    </div>
  )
}
