import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { type Node } from 'prosemirror-model'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import { schema } from '../../../src/renderer/editor/schema'
import { buildInputRules } from '../../../src/renderer/editor/inputRules'

/**
 * Extended inline Markdown: highlight (`==x==`), subscript (`~x~`),
 * superscript (`^x^`), and emoji (`:shortcode:` -> unicode).
 *
 * The hard parts under test:
 *   - `~x~` (subscript) MUST NOT cannibalise `~~x~~` (strikethrough).
 *   - `^x^` (superscript) MUST NOT cannibalise `[^id]` (footnote_ref node).
 *   - emoji shortcodes normalise to the unicode char on first parse and are a
 *     fixed point thereafter.
 */

// 😄 — the unicode char `:smile:` resolves to in markdown-it-emoji's full set.
const SMILE = '\u{1F604}'

// ---------------------------------------------------------------------------
// Doc inspection helpers
// ---------------------------------------------------------------------------

/** Does the doc contain a text node carrying the named mark over `text`? */
function hasMark(doc: Node, markName: string, text: string): boolean {
  let found = false
  doc.descendants((node) => {
    if (
      node.isText &&
      node.text === text &&
      node.marks.some((m) => m.type.name === markName)
    ) {
      found = true
    }
  })
  return found
}

/** Find the first descendant node of the given type, or throw. */
function firstOfType(doc: Node, type: string): Node {
  let found: Node | null = null
  doc.descendants((node) => {
    if (!found && node.type.name === type) found = node
    return found === null
  })
  if (!found) throw new Error(`no "${type}" node in doc`)
  return found
}

/** Concatenate every text node's content in the doc. */
function allText(doc: Node): string {
  let out = ''
  doc.descendants((node) => {
    if (node.isText) out += node.text
  })
  return out
}

const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

// ---------------------------------------------------------------------------
// Highlight: ==x==
// ---------------------------------------------------------------------------

describe('highlight mark (==x==)', () => {
  it('parses ==hi== as a highlight mark', () => {
    expect(hasMark(parseMarkdown('==hi=='), 'highlight', 'hi')).toBe(true)
  })

  it('round-trips ==hi==', () => {
    expect(rt('==hi==')).toBe('==hi==')
  })
})

// ---------------------------------------------------------------------------
// Subscript: ~x~  (must not collide with strikethrough ~~x~~)
// ---------------------------------------------------------------------------

describe('subscript mark (~x~)', () => {
  it('round-trips H~2~O and carries the subscript mark', () => {
    expect(rt('H~2~O')).toBe('H~2~O')
    expect(hasMark(parseMarkdown('H~2~O'), 'subscript', '2')).toBe(true)
  })

  it('does NOT clobber strikethrough ~~strike~~', () => {
    expect(rt('~~strike~~')).toBe('~~strike~~')
    expect(hasMark(parseMarkdown('~~strike~~'), 'strikethrough', 'strike')).toBe(
      true,
    )
  })
})

// ---------------------------------------------------------------------------
// Superscript: ^x^  (must not collide with footnote ref [^id])
// ---------------------------------------------------------------------------

describe('superscript mark (^x^)', () => {
  it('round-trips x^2^ and carries the superscript mark', () => {
    expect(rt('x^2^')).toBe('x^2^')
    expect(hasMark(parseMarkdown('x^2^'), 'superscript', '2')).toBe(true)
  })

  it('keeps [^1] as a footnote_ref node, not a superscript', () => {
    const doc = parseMarkdown('Text[^1].')
    const ref = firstOfType(doc, 'footnote_ref')
    expect(ref.attrs['label']).toBe('1')
    expect(hasMark(doc, 'superscript', '1')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Emoji: :shortcode: -> unicode
// ---------------------------------------------------------------------------

describe('emoji (:shortcode:)', () => {
  it('parses :smile: into the unicode smile char as text', () => {
    const doc = parseMarkdown(':smile:')
    expect(allText(doc)).toContain(SMILE)
  })

  it('is a fixed point for the already-unicode form', () => {
    expect(rt(SMILE)).toBe(SMILE)
  })
})

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

/** Mount a minimal EditorView with only the inputRules plugin. */
function mountView(): EditorView {
  const state = EditorState.create({
    schema,
    plugins: [buildInputRules(schema)],
  })
  const dom = document.createElement('div')
  document.body.appendChild(dom)
  return new EditorView(dom, { state })
}

/** Simulate typing `text` into the view one character at a time. */
function typeText(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection
    const noop = (): typeof view.state.tr => view.state.tr
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, noop),
    )
    if (!handled) {
      view.dispatch(view.state.tr.insertText(char, from, to))
    }
  }
}

/** Does `view`'s doc carry the named mark over `text`? */
function viewHasMark(view: EditorView, markName: string, text: string): boolean {
  return hasMark(view.state.doc, markName, text)
}

/** Concatenate the view's text content. */
function viewText(view: EditorView): string {
  return allText(view.state.doc)
}

describe('extended inline input rules', () => {
  let view: EditorView

  beforeEach(() => {
    view = mountView()
  })

  afterEach(() => {
    view.destroy()
    document.body.innerHTML = ''
  })

  it('==x== -> highlight mark', () => {
    typeText(view, '==hi==')
    expect(viewHasMark(view, 'highlight', 'hi')).toBe(true)
  })

  it('~x~ -> subscript mark', () => {
    typeText(view, '~2~')
    expect(viewHasMark(view, 'subscript', '2')).toBe(true)
  })

  it('~~x~~ -> strikethrough (not subscript)', () => {
    typeText(view, '~~no~~')
    expect(viewHasMark(view, 'strikethrough', 'no')).toBe(true)
    expect(viewHasMark(view, 'subscript', 'no')).toBe(false)
  })

  it('^x^ -> superscript mark', () => {
    typeText(view, '^2^')
    expect(viewHasMark(view, 'superscript', '2')).toBe(true)
  })

  it(':smile: -> unicode emoji char', () => {
    typeText(view, ':smile:')
    expect(viewText(view)).toContain(SMILE)
    expect(viewText(view)).not.toContain(':smile:')
  })

  it('leaves an unknown :shortcode: untouched', () => {
    typeText(view, ':notarealemoji:')
    expect(viewText(view)).toContain(':notarealemoji:')
  })
})
