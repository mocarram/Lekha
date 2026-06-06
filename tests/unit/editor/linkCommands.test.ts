/**
 * Unit tests for linkCommands.ts - the ProseMirror helpers backing the
 * link/image dialogs.
 *
 * States are built from Markdown via parseMarkdown so the tests exercise the
 * real schema, and results are asserted against serialized Markdown so the
 * link/image syntax (`[text](href)`, `![alt](src)`) is verified end-to-end.
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import {
  getLinkAt,
  applyLink,
  removeLink,
  applyImage,
} from '../../../src/renderer/editor/linkCommands'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an EditorState from a Markdown string. */
function stateFromMarkdown(md: string): EditorState {
  return EditorState.create({ doc: parseMarkdown(md), schema })
}

/** Build an EditorState whose selection covers [from, to] in the doc. */
function stateWithSelection(md: string, from: number, to: number): EditorState {
  const doc = parseMarkdown(md)
  const selection = TextSelection.create(doc, from, to)
  return EditorState.create({ doc, schema, selection })
}

/** Build an EditorState with a collapsed cursor at `pos`. */
function stateWithCursor(md: string, pos: number): EditorState {
  return stateWithSelection(md, pos, pos)
}

/** Apply a command's dispatched transaction and return the new doc's markdown. */
function runAndSerialize(
  state: EditorState,
  run: (
    state: EditorState,
    dispatch: (tr: Transaction) => void,
  ) => boolean,
): { handled: boolean; markdown: string } {
  let nextDoc: ProseMirrorNode = state.doc
  const dispatch = (tr: Transaction): void => {
    nextDoc = state.apply(tr).doc
  }
  const handled = run(state, dispatch)
  return { handled, markdown: serializeMarkdown(nextDoc).trim() }
}

/** Find the position just after the first occurrence of `text` in the doc. */
function posOfText(state: EditorState, text: string): number {
  let found = -1
  state.doc.descendants((node, pos) => {
    if (found !== -1) return false
    if (node.isText && node.text) {
      const idx = node.text.indexOf(text)
      if (idx !== -1) found = pos + idx
    }
    return true
  })
  return found
}

// ---------------------------------------------------------------------------
// getLinkAt
// ---------------------------------------------------------------------------

describe('getLinkAt', () => {
  it('returns null when the cursor is not on a link', () => {
    const state = stateWithCursor('Hello world', 3)
    expect(getLinkAt(state)).toBeNull()
  })

  it('returns the link covering the cursor with href, text and range', () => {
    const md = 'See [the docs](https://example.com) now'
    const state = stateFromMarkdown(md)
    // Place the cursor in the middle of "the docs".
    const linkStart = posOfText(state, 'the docs')
    const cursorState = stateWithCursor(md, linkStart + 2)

    const info = getLinkAt(cursorState)
    expect(info).not.toBeNull()
    expect(info?.href).toBe('https://example.com')
    expect(info?.text).toBe('the docs')
    // Range should cover the whole "the docs" run.
    expect(info?.to).toBe(info!.from + 'the docs'.length)
  })

  it('expands to the FULL contiguous link mark range even at the edges', () => {
    const md = '[the docs](https://example.com)'
    const state = stateFromMarkdown(md)
    const linkStart = posOfText(state, 'the docs')
    // Cursor at the very start of the link text.
    const info = getLinkAt(stateWithCursor(md, linkStart))
    expect(info?.text).toBe('the docs')
    expect(info?.href).toBe('https://example.com')
    expect(info?.from).toBe(linkStart)
    expect(info?.to).toBe(linkStart + 'the docs'.length)
  })

  it('captures the link title when present', () => {
    const md = '[x](https://example.com "Tooltip")'
    const state = stateFromMarkdown(md)
    const linkStart = posOfText(state, 'x')
    const info = getLinkAt(stateWithCursor(md, linkStart))
    expect(info?.href).toBe('https://example.com')
    expect(info?.title).toBe('Tooltip')
  })
})

// ---------------------------------------------------------------------------
// applyLink
// ---------------------------------------------------------------------------

describe('applyLink', () => {
  it('adds a link mark over the current selection', () => {
    const md = 'Hello world'
    const state = stateFromMarkdown(md)
    const from = posOfText(state, 'world')
    const selState = stateWithSelection(md, from, from + 'world'.length)

    const { handled, markdown } = runAndSerialize(selState, (s, d) =>
      applyLink(s, d, { href: 'https://example.com' }),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('Hello [world](https://example.com)')
  })

  it('inserts linked text at a collapsed cursor when text is provided', () => {
    const md = 'Hello'
    // Cursor at the end of "Hello".
    const state = stateFromMarkdown(md)
    const pos = posOfText(state, 'Hello') + 'Hello'.length
    const cursorState = stateWithCursor(md, pos)

    const { handled, markdown } = runAndSerialize(cursorState, (s, d) =>
      applyLink(s, d, { href: 'https://example.com', text: ' site' }),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('Hello[ site](https://example.com)')
  })

  it('updates an existing link href and text when the cursor is inside it', () => {
    const md = '[old](https://old.example.com)'
    const state = stateFromMarkdown(md)
    const linkStart = posOfText(state, 'old')
    const cursorState = stateWithCursor(md, linkStart + 1)

    const { handled, markdown } = runAndSerialize(cursorState, (s, d) =>
      applyLink(s, d, { href: 'https://new.example.com', text: 'new' }),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('[new](https://new.example.com)')
  })

  it('returns false at a collapsed cursor with no text and no existing link', () => {
    const md = 'Hello world'
    const state = stateWithCursor(md, 3)
    const { handled } = runAndSerialize(state, (s, d) =>
      applyLink(s, d, { href: 'https://example.com' }),
    )
    expect(handled).toBe(false)
  })

  it('serializes a title when provided', () => {
    const md = 'Hello world'
    const state = stateFromMarkdown(md)
    const from = posOfText(state, 'world')
    const selState = stateWithSelection(md, from, from + 'world'.length)
    const { markdown } = runAndSerialize(selState, (s, d) =>
      applyLink(s, d, { href: 'https://example.com', title: 'Tip' }),
    )
    expect(markdown).toBe('Hello [world](https://example.com "Tip")')
  })
})

// ---------------------------------------------------------------------------
// removeLink
// ---------------------------------------------------------------------------

describe('removeLink', () => {
  it('strips the link mark over the link at the cursor, keeping the text', () => {
    const md = 'See [the docs](https://example.com) now'
    const state = stateFromMarkdown(md)
    const linkStart = posOfText(state, 'the docs')
    const cursorState = stateWithCursor(md, linkStart + 2)

    const { handled, markdown } = runAndSerialize(cursorState, (s, d) =>
      removeLink(s, d),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('See the docs now')
  })

  it('returns false when there is no link at the cursor', () => {
    const md = 'Hello world'
    const state = stateWithCursor(md, 3)
    const { handled } = runAndSerialize(state, (s, d) => removeLink(s, d))
    expect(handled).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// applyImage
// ---------------------------------------------------------------------------

describe('applyImage', () => {
  it('inserts an image node with src at the cursor', () => {
    const md = 'Look:'
    const state = stateFromMarkdown(md)
    // Cursor immediately after the word "Look:" (end of the paragraph text).
    const pos = posOfText(state, 'Look:') + 'Look:'.length
    const cursorState = stateWithCursor(md, pos)

    const { handled, markdown } = runAndSerialize(cursorState, (s, d) =>
      applyImage(s, d, { src: 'https://example.com/x.png' }),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('Look:![](https://example.com/x.png)')
  })

  it('inserts an image node with alt and title', () => {
    const md = 'Pic'
    const state = stateFromMarkdown(md)
    const pos = posOfText(state, 'Pic') + 'Pic'.length
    const cursorState = stateWithCursor(md, pos)

    const { handled, markdown } = runAndSerialize(cursorState, (s, d) =>
      applyImage(s, d, {
        src: 'https://example.com/x.png',
        alt: 'a cat',
        title: 'Tip',
      }),
    )
    expect(handled).toBe(true)
    expect(markdown).toBe('Pic![a cat](https://example.com/x.png "Tip")')
  })
})
