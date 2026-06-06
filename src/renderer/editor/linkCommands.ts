/**
 * linkCommands.ts
 *
 * Pure-ish ProseMirror helpers backing the link/image insert/edit dialogs.
 * Kept separate from editorCommandMap because these helpers are dialog-driven
 * (they take arguments and need to read/expand the current link mark range)
 * rather than zero-arg menu commands.
 *
 * The trickiest piece is `getLinkAt`: a link in the document is a *mark* over a
 * run of text, not a node, so to edit "the whole link" we must expand from the
 * cursor outward to the full contiguous range that carries the same link mark
 * (same href). `expandLinkRange` does that walk.
 */
import { type EditorState, type Transaction, TextSelection } from 'prosemirror-state'
import { type Mark, type ResolvedPos } from 'prosemirror-model'
import { schema } from './schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Information about the link mark covering a position/selection. */
export interface LinkInfo {
  href: string
  title?: string
  /** The text the link mark covers. */
  text: string
  /** Document position where the link run starts. */
  from: number
  /** Document position where the link run ends. */
  to: number
}

/** Arguments for {@link applyLink}. */
export interface ApplyLinkArgs {
  href: string
  title?: string
  /** Text to use when inserting a brand-new link at a collapsed cursor, or
   *  when replacing the text of an existing link. */
  text?: string
}

/** Arguments for {@link applyImage}. */
export interface ApplyImageArgs {
  src: string
  alt?: string
  title?: string
}

type Dispatch = (tr: Transaction) => void

// ---------------------------------------------------------------------------
// Mark-range expansion
// ---------------------------------------------------------------------------

const linkType = schema.marks['link']!
const imageType = schema.nodes['image']!

/** Find the link mark of the given type at a resolved position, if any. */
function linkMarkAt($pos: ResolvedPos): Mark | undefined {
  // marksAcross collapsed positions can miss the mark at the very edge of a
  // run, so consult both the marks at $pos and the marks of the node before/
  // after it. We prefer the node *before* (typical "cursor sits after the
  // last char of the link" case) then fall back to the node after.
  const candidates: readonly (readonly Mark[])[] = [
    $pos.marks(),
    $pos.nodeBefore ? $pos.nodeBefore.marks : [],
    $pos.nodeAfter ? $pos.nodeAfter.marks : [],
  ]
  for (const marks of candidates) {
    const found = linkType.isInSet(marks)
    if (found) return found
  }
  return undefined
}

/**
 * Expand outward from `pos` to the full contiguous range that carries `mark`
 * (matched by `eq`, i.e. same href/title). Walks within the parent textblock.
 */
function expandLinkRange(
  state: EditorState,
  pos: number,
  mark: Mark,
): { from: number; to: number } {
  const $pos = state.doc.resolve(pos)
  const parent = $pos.parent
  const parentStart = $pos.start()

  // Collect the [start,end) span of every inline child of the parent textblock
  // together with whether it carries our link mark.
  const ranges: { start: number; end: number; carries: boolean }[] = []
  parent.forEach((child, childOffset) => {
    const start = parentStart + childOffset
    ranges.push({
      start,
      end: start + child.nodeSize,
      carries: mark.isInSet(child.marks),
    })
  })

  // Seed the window from the child containing the position (or adjacent to it
  // when the cursor sits on a boundary), then grow it over contiguous children
  // that carry the same mark. A fixpoint loop absorbs runs reached on either
  // side once the window touches them.
  let from = pos
  let to = pos
  let changed = true
  while (changed) {
    changed = false
    for (const r of ranges) {
      if (!r.carries) continue
      const touches = r.start <= to && r.end >= from
      if (touches && (r.start < from || r.end > to)) {
        from = Math.min(from, r.start)
        to = Math.max(to, r.end)
        changed = true
      }
    }
  }

  return { from, to }
}

// ---------------------------------------------------------------------------
// getLinkAt
// ---------------------------------------------------------------------------

/**
 * Return the link mark covering the given position (defaults to the selection
 * head), expanded to the full contiguous link run, or null when there is no
 * link there. An explicit `pos` is used by click handling, where the selection
 * has not yet moved to the clicked position.
 */
export function getLinkAt(state: EditorState, pos?: number): LinkInfo | null {
  const from = pos ?? state.selection.from
  const $from = state.doc.resolve(from)
  const mark = linkMarkAt($from)
  if (!mark) return null

  const { from: rangeFrom, to: rangeTo } = expandLinkRange(state, from, mark)
  const text = state.doc.textBetween(rangeFrom, rangeTo)
  const href = (mark.attrs['href'] as string | null) ?? ''
  const title = mark.attrs['title'] as string | null

  return {
    href,
    ...(title ? { title } : {}),
    text,
    from: rangeFrom,
    to: rangeTo,
  }
}

// ---------------------------------------------------------------------------
// applyLink
// ---------------------------------------------------------------------------

/**
 * Apply a link based on the current selection/cursor:
 *   - selection present: set the link mark over the selection (optionally
 *     replacing the selected text with `text`).
 *   - collapsed cursor inside an existing link: update the whole link's
 *     href/title and (if `text` given) its text.
 *   - collapsed cursor with `text`: insert `text` carrying the link mark.
 *   - collapsed cursor with no text and no existing link: no-op (false).
 */
export function applyLink(
  state: EditorState,
  dispatch: Dispatch | undefined,
  args: ApplyLinkArgs,
): boolean {
  const { href, title, text } = args
  const mark = linkType.create({ href, title: title ?? null })
  const { from, to, empty } = state.selection

  // Case 1: collapsed cursor inside an existing link -> update the whole link.
  if (empty) {
    const existing = getLinkAt(state)
    if (existing) {
      if (!dispatch) return true
      const newText = text && text.length > 0 ? text : existing.text
      const tr = state.tr
      tr.replaceWith(existing.from, existing.to, schema.text(newText, [mark]))
      tr.setSelection(
        TextSelection.create(tr.doc, existing.from, existing.from + newText.length),
      )
      dispatch(tr.scrollIntoView())
      return true
    }

    // Case 2: collapsed cursor with text -> insert linked text.
    if (text && text.length > 0) {
      if (!dispatch) return true
      const tr = state.tr.insert(from, schema.text(text, [mark]))
      tr.setSelection(TextSelection.create(tr.doc, from, from + text.length))
      dispatch(tr.scrollIntoView())
      return true
    }

    // Nothing to link.
    return false
  }

  // Case 3: a real selection -> set (or replace) the link mark over it.
  if (!dispatch) return true
  const tr = state.tr
  if (text && text.length > 0 && text !== state.doc.textBetween(from, to)) {
    tr.replaceWith(from, to, schema.text(text, [mark]))
    tr.setSelection(TextSelection.create(tr.doc, from, from + text.length))
  } else {
    tr.addMark(from, to, mark)
  }
  dispatch(tr.scrollIntoView())
  return true
}

// ---------------------------------------------------------------------------
// removeLink
// ---------------------------------------------------------------------------

/**
 * Remove the link mark over the link at the current cursor/selection. Returns
 * false when there is no link there.
 */
export function removeLink(
  state: EditorState,
  dispatch: Dispatch | undefined,
): boolean {
  const info = getLinkAt(state)
  if (!info) return false
  if (!dispatch) return true
  dispatch(state.tr.removeMark(info.from, info.to, linkType).scrollIntoView())
  return true
}

// ---------------------------------------------------------------------------
// applyImage
// ---------------------------------------------------------------------------

/** Insert an image node at the current selection. */
export function applyImage(
  state: EditorState,
  dispatch: Dispatch | undefined,
  args: ApplyImageArgs,
): boolean {
  const { src, alt, title } = args
  if (!src) return false
  if (!dispatch) return true
  const node = imageType.create({
    src,
    alt: alt ?? null,
    title: title ?? null,
  })
  dispatch(state.tr.replaceSelectionWith(node).scrollIntoView())
  return true
}
