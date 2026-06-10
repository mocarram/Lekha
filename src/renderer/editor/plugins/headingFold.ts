/**
 * headingFold.ts - ProseMirror plugin for heading section folding.
 *
 * Clicking the fold chevron next to a heading collapses its SECTION: the blocks
 * after the heading up to - but NOT including - the next heading of the same or
 * higher level (or the end of the document).
 *
 * IMPORTANT: folding is a VIEW concern only. It never mutates the document, so
 * `serializeMarkdown` always emits the full markdown whether a heading is folded
 * or not. The hidden blocks are simply given `display:none` via a node
 * decoration (`.folded-block`); the underlying nodes are untouched.
 *
 * PLUGIN STATE:
 *   A `Set<number>` of folded heading positions. On every transaction we remap
 *   each folded position through `tr.mapping` so the set stays correct across
 *   edits (insertions/deletions before a folded heading shift its position).
 *   A meta on the plugin key (see `toggleFoldMeta`) toggles a heading.
 *
 * DECORATIONS (recomputed in `apply`, served via `props.decorations`):
 *   - A WIDGET chevron at each heading's content start, clickable to toggle.
 *   - For each FOLDED heading: a NODE decoration with `class:'folded-block'` on
 *     every top-level block inside its section range (CSS hides them), plus a
 *     `class:'is-folded'` node decoration on the heading itself so its chevron
 *     can rotate to the "collapsed" orientation.
 */

import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { Node } from 'prosemirror-model'

/**
 * Plugin state: the set of folded heading positions plus the derived
 * decorations. Both live together so forked states (e.g. in tests, undo) stay
 * independent - no shared mutable module-level set.
 */
export interface HeadingFoldState {
  folded: Set<number>
  decorations: DecorationSet
}

export const headingFoldKey = new PluginKey<HeadingFoldState>('headingFold')

/** Meta payload that toggles the fold state of the heading at `pos`. */
export interface ToggleFoldMeta {
  type: 'toggleFold'
  pos: number
}

/** Build the meta value dispatched on the plugin key to toggle a heading. */
export function toggleFoldMeta(pos: number): ToggleFoldMeta {
  return { type: 'toggleFold', pos }
}

/**
 * Compute the hidden range for the section owned by the heading at `headingPos`.
 *
 * The section starts immediately AFTER the heading node (`headingPos +
 * heading.nodeSize`) and ends at the start of the next top-level heading whose
 * level is <= this heading's level, or at the end of the document if no such
 * heading follows.
 *
 * We only scan top-level children of the doc (headings are always top-level in
 * this schema), accumulating positions. Returns `{ from, to }` where
 * `from === to` means the section is empty (nothing to hide).
 */
export function sectionRange(doc: Node, headingPos: number): { from: number; to: number } {
  const heading = doc.nodeAt(headingPos)
  if (!heading || heading.type.name !== 'heading') {
    return { from: headingPos, to: headingPos }
  }
  const level = heading.attrs['level'] as number
  const from = headingPos + heading.nodeSize

  // Walk top-level children, tracking each child's start offset. Once we pass
  // the folded heading, the first heading with level <= ours ends the section.
  let offset = 0
  let to = doc.content.size
  let pastHeading = false
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    const start = offset
    offset += child.nodeSize
    if (start === headingPos) {
      pastHeading = true
      continue
    }
    if (!pastHeading) continue
    if (child.type.name === 'heading' && (child.attrs['level'] as number) <= level) {
      to = start
      break
    }
  }
  return { from, to }
}

/**
 * Build the DecorationSet for a given doc and set of folded heading positions.
 *
 * Always adds a clickable chevron widget at each heading. For folded headings,
 * adds `is-folded` to the heading and `folded-block` to every top-level block
 * inside its section range.
 */
function buildDecorations(doc: Node, folded: Set<number>): DecorationSet {
  const decos: Decoration[] = []

  // Index top-level child start offsets once so we can collect the blocks that
  // fall inside a folded section without re-walking the whole doc per fold.
  const childStarts: Array<{ start: number; end: number; isHeading: boolean }> = []
  let offset = 0
  for (let i = 0; i < doc.childCount; i++) {
    const child = doc.child(i)
    childStarts.push({
      start: offset,
      end: offset + child.nodeSize,
      isHeading: child.type.name === 'heading',
    })
    offset += child.nodeSize
  }

  for (const { start, isHeading } of childStarts) {
    if (!isHeading) continue
    const isFolded = folded.has(start)

    // Chevron widget at the heading's content start (start + 1 = just inside).
    decos.push(
      Decoration.widget(start + 1, () => foldToggleDOM(start, isFolded), {
        // A stable key per heading+state lets ProseMirror reuse the DOM and
        // keeps the widget on the left of the heading text.
        key: `fold-${start}-${isFolded ? 'f' : 'o'}`,
        side: -1,
        ignoreSelection: true,
      }),
    )

    if (!isFolded) continue

    // Mark the heading itself so its chevron can rotate when folded.
    decos.push(Decoration.node(start, start + doc.nodeAt(start)!.nodeSize, { class: 'is-folded' }))

    // Hide every top-level block inside the section range.
    const { from, to } = sectionRange(doc, start)
    for (const block of childStarts) {
      if (block.start >= from && block.end <= to) {
        decos.push(Decoration.node(block.start, block.end, { class: 'folded-block' }))
      }
    }
  }

  return DecorationSet.create(doc, decos)
}

/**
 * Create the DOM for a heading fold toggle. We attach the heading position via
 * a data attribute; the plugin dispatches the toggle from a mousedown handler.
 *
 * The chevron glyph is drawn with a CSS `::before` pseudo-element, NOT as text,
 * so the empty button contributes nothing to the heading's `textContent` (the
 * widget lives inside the heading element). This keeps the document text clean.
 */
function foldToggleDOM(headingPos: number, isFolded: boolean): HTMLElement {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `heading-fold-toggle${isFolded ? ' heading-fold-toggle--folded' : ''}`
  el.setAttribute('data-heading-pos', String(headingPos))
  el.setAttribute('contenteditable', 'false')
  el.setAttribute('aria-label', isFolded ? 'Expand heading' : 'Collapse heading')
  return el
}

/** Read the next folded set from a transaction: remap, then apply any toggle. */
function nextFolded(prev: Set<number>, tr: Transaction): Set<number> {
  // Map each folded heading position through the transaction's mapping so the
  // fold tracks the heading across edits (don't go stale).
  const mapped = new Set<number>()
  for (const pos of prev) {
    const newPos = tr.mapping.map(pos, -1)
    // Drop a fold whose heading was deleted (position mapped into a gap).
    const node = tr.doc.nodeAt(newPos)
    if (node && node.type.name === 'heading') mapped.add(newPos)
  }

  const meta = tr.getMeta(headingFoldKey) as ToggleFoldMeta | undefined
  if (meta && meta.type === 'toggleFold') {
    if (mapped.has(meta.pos)) mapped.delete(meta.pos)
    else mapped.add(meta.pos)
  }
  return mapped
}

/**
 * Toggle the fold state of the heading at `headingPos` by dispatching a meta.
 * Used by the chevron widget's click handler.
 */
function toggleFold(view: EditorView, headingPos: number): void {
  view.dispatch(view.state.tr.setMeta(headingFoldKey, toggleFoldMeta(headingPos)))
}

/**
 * The headingFold plugin. Tracks folded positions, remaps them through every
 * transaction, and serves fold decorations. Clicking a chevron widget toggles
 * the corresponding heading.
 */
export function headingFoldPlugin(): Plugin<HeadingFoldState> {
  return new Plugin<HeadingFoldState>({
    key: headingFoldKey,

    state: {
      init(_config, state: EditorState): HeadingFoldState {
        const folded = new Set<number>()
        return { folded, decorations: buildDecorations(state.doc, folded) }
      },
      apply(tr, prev, _oldState, newState): HeadingFoldState {
        // Selection-only transactions cannot move headings or change folds:
        // reuse the previous state untouched. Rebuilding here ran an
        // O(blocks + headings) walk + widget allocation on every cursor move.
        if (!tr.docChanged && tr.getMeta(headingFoldKey) === undefined) return prev
        const folded = nextFolded(prev.folded, tr)
        // Doc changes rebuild (not map) the set: the chevron widgets embed
        // their heading position in the DOM, so mapped decorations would keep
        // stale positions and break toggle clicks.
        return { folded, decorations: buildDecorations(newState.doc, folded) }
      },
    },

    props: {
      decorations(state) {
        return headingFoldKey.getState(state)?.decorations ?? DecorationSet.empty
      },

      // Toggle folding when a chevron widget is pressed. We use mousedown so the
      // editor selection isn't moved into the heading before we handle it, and
      // return true to consume the event.
      handleDOMEvents: {
        mousedown(view, event) {
          const target = event.target as HTMLElement | null
          const toggle = target?.closest('.heading-fold-toggle') as HTMLElement | null
          if (!toggle) return false
          const posAttr = toggle.getAttribute('data-heading-pos')
          if (posAttr === null) return false
          event.preventDefault()
          toggleFold(view, Number(posAttr))
          return true
        },
      },
    },
  })
}
