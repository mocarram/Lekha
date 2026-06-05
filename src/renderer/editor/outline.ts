import type { Node } from 'prosemirror-model'
import type { OutlineItem } from '@shared/types'

/**
 * Extract an ordered list of headings from a ProseMirror document.
 *
 * Uses `doc.descendants` to walk the tree in document order. For each
 * `heading` node the position reported by `descendants` is recorded directly
 * — it is the token-stream offset of the node's opening position. Inline
 * marks (bold, italic, etc.) are flattened to plain text via `textContent`.
 */
export function getOutline(doc: Node): OutlineItem[] {
  const items: OutlineItem[] = []

  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      items.push({
        level: node.attrs['level'] as number,
        text: node.textContent,
        pos,
      })
    }
  })

  return items
}
