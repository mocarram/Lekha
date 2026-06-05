import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import { createLowlight, common } from 'lowlight'
import type { Element, Root, RootContent, ElementContent } from 'hast'

// ---------------------------------------------------------------------------
// Shared lowlight instance (language grammars loaded once at module load).
// ---------------------------------------------------------------------------

const lowlight = createLowlight(common)

// ---------------------------------------------------------------------------
// Content-only cache: keyed by "<language>\x00<code>".
//
// The expensive call lowlight.highlight() is pure content - the same language
// and code always produce the same hast tree regardless of where in the document
// the block lives.  Caching the hast Root by content means:
//   - editing text ABOVE a code block (which shifts its position) does NOT
//     invalidate the cache entry and does NOT re-run the highlighter.
//   - the cache never accumulates stale position-keyed entries, so there is no
//     unbounded memory leak when blocks are moved around the document.
//
// Position mapping (walkHast) is cheap and is recomputed on every decorations()
// call using the current blockStart.
// ---------------------------------------------------------------------------

const hastCache = new Map<string, Root>()

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
 * Run lowlight.highlight() and return the hast Root, memoized by content.
 * This is the expensive step; it is purely content-based and position-agnostic.
 *
 * @param language - recognised lowlight language identifier
 * @param code     - source text of the code block
 */
function highlightToHast(language: string, code: string): Root {
  const key = `${language}\x00${code}`
  const cached = hastCache.get(key)
  if (cached) return cached

  const root = lowlight.highlight(language, code)
  hastCache.set(key, root)
  return root
}

/**
 * Map a cached hast Root to ProseMirror inline Decorations anchored at
 * `blockStart`.  Always recomputed so positions are never stale.
 *
 * @param root       - hast Root from highlightToHast()
 * @param blockStart - current document position of the code_block opening token
 */
function hastToDecorations(root: Root, blockStart: number): Decoration[] {
  const decos: Decoration[] = []
  walkHast(root.children, blockStart, 0, [], decos)
  return decos
}

/**
 * Return inline Decorations for one code_block node.
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

  const root = highlightToHast(language, node.textContent)
  return hastToDecorations(root, blockStart)
}

// ---------------------------------------------------------------------------
// Public plugin factory
// ---------------------------------------------------------------------------

/**
 * ProseMirror plugin that applies syntax-highlight decorations to code_block
 * nodes using lowlight (highlight.js grammars).
 *
 * The hast tree produced by lowlight is cached keyed by content (language +
 * code) only, so editing text elsewhere in the document never invalidates a
 * cache entry and no stale entries accumulate.  Position mapping is cheap and
 * is recomputed on every decorations() call from the current block position.
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
