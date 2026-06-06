import type { Node } from 'prosemirror-model'
import type { OutlineItem } from '@shared/types'

/**
 * Extract an ordered list of headings from a ProseMirror document.
 *
 * Uses `doc.descendants` to walk the tree in document order. For each
 * `heading` node the position reported by `descendants` is recorded directly
 * - it is the token-stream offset of the node's opening position. Inline
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

/**
 * A node in the nested outline tree: an OutlineItem plus its child headings.
 */
export interface OutlineNode extends OutlineItem {
  children: OutlineNode[]
}

/**
 * Build a hierarchical tree from the FLAT outline list.
 *
 * A heading's children are the subsequent headings of strictly greater level,
 * up to (but excluding) the next heading of the same-or-lower level. We walk a
 * stack of "open ancestors": before placing each item we pop every ancestor
 * whose level is >= the item's level (those sections have ended), then attach
 * the item to whatever remains on top of the stack (a root if the stack is
 * empty) and push it as the new deepest open ancestor.
 *
 * This handles deeper-then-shallower sequences correctly: e.g. H1 > H2 > H3
 * then H2 pops H3 and the first H2 off, re-attaching the new H2 under the H1.
 */
export function buildOutlineTree(items: OutlineItem[]): OutlineNode[] {
  const roots: OutlineNode[] = []
  const stack: OutlineNode[] = []

  for (const item of items) {
    const node: OutlineNode = { ...item, children: [] }
    // Pop ancestors that are siblings/ancestors of this heading (level >=).
    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) {
      stack.pop()
    }
    if (stack.length === 0) {
      roots.push(node)
    } else {
      stack[stack.length - 1]!.children.push(node)
    }
    stack.push(node)
  }

  return roots
}
