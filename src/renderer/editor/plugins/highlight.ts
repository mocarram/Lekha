import { Plugin, PluginKey } from 'prosemirror-state'
import type { EditorState, Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'
import type { createLowlight } from 'lowlight'
import type { Element, Root, RootContent, ElementContent } from 'hast'

// ---------------------------------------------------------------------------
// Shared, lazily-loaded lowlight instance.
//
// `lowlight`'s `common` grammar set statically pulls in EVERY highlight.js
// language (~2.6 MB of grammar code). Importing it at module scope would drag
// that whole payload into the eager editor bundle loaded at app startup for
// every document - even ones with no code blocks.
//
// Instead we mirror the lazy pattern used for katex (mathNodeView.ts) and
// mermaid (mermaid.ts): dynamic-import `lowlight` + `common` on first need and
// cache the resolved instance. `import('lowlight')` is statically analysable by
// Rollup, so the grammars are emitted as a separate, deferred chunk (the
// `highlight` manualChunk in electron.vite.config.ts) and never load until a
// code_block with a recognised language is first highlighted.
//
// ONE instance is shared with languages.ts (the language-selector registry):
// it imports `getLowlight` / `whenLanguagesReady` from here so both consumers
// route through the same lazy instance rather than each calling
// createLowlight(common) eagerly.
// ---------------------------------------------------------------------------

type Lowlight = ReturnType<typeof createLowlight>

/** Resolved instance once the grammars have loaded; null until then. */
let lowlightInstance: Lowlight | null = null

/** Cached load promise so the grammar chunk is fetched exactly once. */
let lowlightPromise: Promise<Lowlight> | null = null

/**
 * Live EditorViews using the highlight plugin. When the grammars finish
 * loading we dispatch a re-decorate transaction to each so blocks that
 * rendered un-highlighted (before the chunk arrived) get decorated in place.
 * A Set keyed by the view keeps registration idempotent and cheap to clean up.
 */
const liveViews = new Set<EditorView>()

/**
 * Lazily load `lowlight` + the `common` grammar set and build the shared
 * instance. Cached: the dynamic import (and the deferred grammar chunk) happen
 * exactly once. On first resolution every live highlight view is asked to
 * re-decorate so already-mounted code blocks pick up highlighting.
 */
export function whenLanguagesReady(): Promise<Lowlight> {
  lowlightPromise ??= import('lowlight').then((m) => {
    const inst = m.createLowlight(m.common)
    lowlightInstance = inst
    // Re-decorate every live view now that grammars exist. Each dispatch is a
    // no-doc-change transaction carrying the LANGUAGES_READY meta so the plugin
    // rebuilds its DecorationSet from scratch.
    for (const view of liveViews) {
      view.dispatch(view.state.tr.setMeta(highlightPluginKey, LANGUAGES_READY))
    }
    return inst
  })
  return lowlightPromise
}

/**
 * Return the shared lowlight instance if the grammars have already loaded, or
 * null if they have not. Synchronous; callers that need the instance to exist
 * should `await whenLanguagesReady()` first (or trigger it and react to the
 * re-decorate transaction). Shared with languages.ts.
 */
export function getLowlight(): Lowlight | null {
  return lowlightInstance
}

// ---------------------------------------------------------------------------
// Content-only cache: keyed by "<language>\x00<code>".
//
// The expensive call lowlight.highlight() is pure content - the same language
// and code always produce the same hast tree regardless of where in the document
// the block lives.  Caching the hast Root by content means:
//   - editing text ABOVE a code block (which shifts its position) does NOT
//     invalidate the cache entry and does NOT re-run the highlighter.
//   - the cache never accumulates stale position-keyed entries when blocks are
//     moved around the document.
//
// Bounded as an LRU: typing INSIDE a code block produces a new content key per
// keystroke, so without eviction a long editing session accumulated one hast
// tree per keystroke for the session's lifetime. The Map's insertion order is
// the recency order (get() re-inserts), and the oldest entry is dropped once
// the cap is exceeded. The cap comfortably holds every block of a large doc
// plus recent keystroke states.
//
// Position mapping (walkHast) is cheap and is recomputed whenever a block needs
// (re)decorating using the current blockStart.
// ---------------------------------------------------------------------------

const HAST_CACHE_MAX = 200

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
 * @param lowlight - the resolved shared lowlight instance
 * @param language - recognised lowlight language identifier
 * @param code     - source text of the code block
 */
function highlightToHast(
  lowlight: Lowlight,
  language: string,
  code: string,
): Root {
  const key = `${language}\x00${code}`
  const cached = hastCache.get(key)
  if (cached) {
    // Refresh recency: re-insert so this entry moves to the back of the
    // Map's insertion order (= most recently used).
    hastCache.delete(key)
    hastCache.set(key, cached)
    return cached
  }

  const root = lowlight.highlight(language, code)
  hastCache.set(key, root)
  // Evict the least recently used entry (the Map's first key) past the cap.
  if (hastCache.size > HAST_CACHE_MAX) {
    const oldest = hastCache.keys().next().value
    if (oldest !== undefined) hastCache.delete(oldest)
  }
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
 * Returns an empty array when the grammars have not loaded yet (the block stays
 * un-highlighted/plain until whenLanguagesReady() resolves and triggers a
 * re-decorate), or when the language is empty/unrecognised.
 *
 * @param node       - the code_block ProseMirror node
 * @param blockStart - document position of the node's opening token
 */
function decorateBlock(node: Node, blockStart: number): Decoration[] {
  const lowlight = lowlightInstance
  // Grammars not loaded yet: no decorations. The view() lifecycle has already
  // kicked off loading and will re-decorate once it resolves.
  if (!lowlight) return []

  const language = (node.attrs['language'] as string) ?? ''

  // Guard: skip empty or unrecognised languages - plain text, no decorations.
  if (!language || !lowlight.registered(language)) {
    return []
  }

  const root = highlightToHast(lowlight, language, node.textContent)
  return hastToDecorations(root, blockStart)
}

// ---------------------------------------------------------------------------
// Full-document decoration build
// ---------------------------------------------------------------------------

/** Build a DecorationSet covering every code_block in the document. */
function buildAll(doc: Node): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'code_block') {
      decos.push(...decorateBlock(node, pos))
      // Don't descend into code_block content (it's just text nodes).
      return false
    }
    return true
  })
  return DecorationSet.create(doc, decos)
}

/** Does the document contain at least one code_block node? */
function hasCodeBlock(doc: Node): boolean {
  let found = false
  doc.descendants((node) => {
    if (found) return false
    if (node.type.name === 'code_block') {
      found = true
      return false
    }
    return true
  })
  return found
}

// ---------------------------------------------------------------------------
// Incremental re-decoration
//
// Most transactions are selection-only or edit a single block. Re-running a
// full doc walk + rebuild on every transaction is wasteful. Instead the plugin
// keeps its DecorationSet in plugin state and:
//   - selection-only transactions: return the existing set unchanged (zero work).
//   - doc-changing transactions: map the set through tr.mapping (cheap), then
//     re-decorate only the code_blocks that intersect the changed ranges.
// ---------------------------------------------------------------------------

/** Collect the changed [from,to] ranges (in the NEW doc) from a transaction. */
function changedRanges(tr: Transaction): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const step of tr.steps) {
    const map = step.getMap()
    map.forEach((_fromA, _toA, fromB, toB) => {
      ranges.push([fromB, toB])
    })
  }
  return ranges
}

/**
 * Re-decorate only the code_blocks in `doc` that intersect any changed range,
 * starting from a mapped-forward DecorationSet.
 */
function patchChanged(
  mapped: DecorationSet,
  doc: Node,
  ranges: Array<[number, number]>,
): DecorationSet {
  let set = mapped
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true
    const blockEnd = pos + node.nodeSize
    const intersects = ranges.some(([from, to]) => to >= pos && from <= blockEnd)
    if (intersects) {
      // Drop any (stale, mapped) decorations inside this block and rebuild them.
      const stale = set.find(pos, blockEnd)
      if (stale.length > 0) set = set.remove(stale)
      const fresh = decorateBlock(node, pos)
      if (fresh.length > 0) set = set.add(doc, fresh)
    }
    // Don't descend into code_block content.
    return false
  })
  return set
}

// ---------------------------------------------------------------------------
// Public plugin factory
// ---------------------------------------------------------------------------

/** Plugin key + ready-meta sentinel for the highlight plugin. */
export const highlightPluginKey = new PluginKey<DecorationSet>('lekha-highlight')
const LANGUAGES_READY = Symbol('lekha-highlight-languages-ready')

/**
 * ProseMirror plugin that applies syntax-highlight decorations to code_block
 * nodes using lowlight (highlight.js grammars).
 *
 * Stateful + incremental: the DecorationSet lives in plugin state.
 *   - Selection-only transactions reuse the existing set with zero work.
 *   - Doc edits map the set forward and re-decorate only intersecting blocks.
 *   - A LANGUAGES_READY meta (dispatched once the lazy grammar chunk loads)
 *     triggers a full rebuild so blocks decorated as plain pick up highlighting.
 *
 * The hast tree produced by lowlight is cached keyed by content (language +
 * code) only, so editing text elsewhere in the document never invalidates a
 * cache entry and no stale entries accumulate. Position mapping is cheap and is
 * recomputed from the current block position whenever a block is (re)decorated.
 */
export function highlightPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: highlightPluginKey,
    state: {
      init(_config, state: EditorState): DecorationSet {
        return buildAll(state.doc)
      },
      apply(tr, value, _oldState, newState): DecorationSet {
        // Grammars just finished loading: rebuild everything from scratch.
        if (tr.getMeta(highlightPluginKey) === LANGUAGES_READY) {
          return buildAll(newState.doc)
        }
        // Selection-only (no doc change): nothing to re-highlight.
        if (!tr.docChanged) return value
        // Map existing decorations forward, then patch only changed blocks.
        const mapped = value.map(tr.mapping, tr.doc)
        return patchChanged(mapped, newState.doc, changedRanges(tr))
      },
    },
    props: {
      decorations(state) {
        return highlightPluginKey.getState(state)
      },
    },
    view(view) {
      // Register this view so the lazy loader can re-decorate it once grammars
      // arrive. Only kick off loading if the doc actually has a code block (and
      // grammars are not already loaded) - documents without code never pay the
      // cost of fetching the grammar chunk.
      liveViews.add(view)
      if (!lowlightInstance && hasCodeBlock(view.state.doc)) {
        void whenLanguagesReady()
      }
      return {
        update(updatedView, prevState) {
          // A code block may appear later (paste / slash menu); load on demand.
          // Only re-walk the doc when it actually changed - selection-only
          // updates would otherwise pay an O(nodes) scan on every cursor move
          // for as long as the document contains no code block.
          if (
            !lowlightInstance &&
            updatedView.state.doc !== prevState.doc &&
            hasCodeBlock(updatedView.state.doc)
          ) {
            void whenLanguagesReady()
          }
        },
        destroy() {
          liveViews.delete(view)
        },
      }
    },
  })
}
