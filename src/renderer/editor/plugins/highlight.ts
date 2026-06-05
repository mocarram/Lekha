import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import { createLowlight, common } from 'lowlight'
import type { Element, RootContent, ElementContent } from 'hast'

// ---------------------------------------------------------------------------
// Shared lowlight instance (language grammars loaded once at module load).
// ---------------------------------------------------------------------------

const lowlight = createLowlight(common)

// ---------------------------------------------------------------------------
// Cache: keyed by "<language> <code>" to avoid re-highlighting unchanged blocks.
// ---------------------------------------------------------------------------

const highlightCache = new Map<string, Decoration[]>()

function cacheKey(language: string, code: string): string {
  return `${language}\x00${code}`
}

// ---------------------------------------------------------------------------
// hast traversal helpers
// ---------------------------------------------------------------------------

/**
 * Walk the hast tree produced by lowlight and accumulate ProseMirror inline
 * Decorations for each hast text node.
 *
 * Position arithmetic:
 *   - A ProseMirror `code_block` node at document position P has its opening
 *     token at P and its content begins at P + 1.
 *   - We walk the hast tree left-to-right, tracking `offset` (bytes of text
 *     content consumed so far within the code block).
 *   - Each hast text node occupies [blockStart + 1 + offset,
 *                                   blockStart + 1 + offset + text.length].
 *   - Element nodes contribute class names that apply to all text descendants;
 *     we pass the current class stack down the recursion.
 *
 * @param nodes     - hast child nodes to walk (Root children or Element children)
 * @param blockStart - ProseMirror position of the code_block node's opening token
 * @param offset     - mutable cursor: text characters consumed inside the block
 * @param classes    - class names inherited from ancestor hast elements
 * @param decos      - accumulator for newly created decorations
 * @returns updated offset after consuming all text in `nodes`
 */
function walkHast(
  nodes: ReadonlyArray<RootContent | ElementContent>,
  blockStart: number,
  offset: number,
  classes: string[],
  decos: Decoration[],
): number {
  for (const node of nodes) {
    if (node.type === 'text') {
      // Leaf text node: emit a decoration if we have class context, then advance.
      const { value } = node
      if (classes.length > 0 && value.length > 0) {
        // Content starts at blockStart + 1 (skip the block's opening token).
        const from = blockStart + 1 + offset
        const to = from + value.length
        decos.push(Decoration.inline(from, to, { class: classes.join(' ') }))
      }
      offset += value.length
    } else if (node.type === 'element') {
      // Element node: collect its class names and recurse into children.
      const ownClasses = resolveClasses(node)
      offset = walkHast(
        node.children,
        blockStart,
        offset,
        classes.length > 0 ? [...classes, ...ownClasses] : ownClasses,
        decos,
      )
    }
    // Other node types (comment, doctype, etc.) carry no text - skip them.
  }
  return offset
}

/** Extract class string array from a hast element's `properties.className`. */
function resolveClasses(el: Element): string[] {
  const raw = el.properties?.['className']
  if (Array.isArray(raw)) {
    return raw.map(String).filter(Boolean)
  }
  return []
}

// ---------------------------------------------------------------------------
// Core highlighting logic for a single code_block node
// ---------------------------------------------------------------------------

/**
 * Return inline Decorations for one code_block, using the cache when possible.
 *
 * @param node       - the code_block ProseMirror node
 * @param blockStart - document position of the node's opening token
 */
function decorateBlock(node: Node, blockStart: number): Decoration[] {
  const language = (node.attrs['language'] as string) ?? ''

  // Guard: skip empty or unrecognised languages - plain text, no decorations.
  if (!language || !lowlight.registered(language)) {
    return []
  }

  const code = node.textContent

  // Cache hit: reuse existing decoration objects.
  // Decorations are position-absolute, so the key must include blockStart as well
  // as language+code so blocks at different positions with identical content
  // each get their own correctly-positioned decoration list.
  const posKey = cacheKey(`${blockStart}:${language}`, code)
  const cached = highlightCache.get(posKey)
  if (cached) return cached

  // Highlight: lowlight returns a hast Root whose children are the token spans.
  const tree = lowlight.highlight(language, code)
  const decos: Decoration[] = []
  walkHast(tree.children, blockStart, 0, [], decos)

  highlightCache.set(posKey, decos)
  return decos
}

// ---------------------------------------------------------------------------
// Public plugin factory
// ---------------------------------------------------------------------------

/**
 * ProseMirror plugin that applies syntax-highlight decorations to code_block
 * nodes using lowlight (highlight.js grammars).
 *
 * Decorations are recomputed on every state access but cached per
 * (blockPosition, language, code) triple so unchanged blocks are essentially
 * free after the first render.
 */
export function highlightPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const decos: Decoration[] = []

        state.doc.descendants((node, pos) => {
          if (node.type.name === 'code_block') {
            decos.push(...decorateBlock(node, pos))
            // Don't descend into code_block content (it's just text nodes).
            return false
          }
          return true
        })

        return DecorationSet.create(state.doc, decos)
      },
    },
  })
}
