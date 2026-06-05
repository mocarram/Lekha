import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { type Node } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import { buildInputRules } from '../../../src/renderer/editor/inputRules'
import { mathInlineNodeView, mathBlockNodeView } from '../../../src/renderer/editor/mathNodeView'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

/** Find the first descendant node of the given type, or throw. */
function firstOfType(doc: Node, type: string): Node {
  let found: Node | null = null
  doc.descendants((node) => {
    if (!found && node.type.name === type) {
      found = node
    }
    return found === null
  })
  if (!found) throw new Error(`no "${type}" node in doc`)
  return found
}

/** Mount a minimal view with math nodeviews and input rules. */
function mountView(markdown: string): EditorView {
  const doc = parseMarkdown(markdown)
  const state = EditorState.create({
    schema,
    doc,
    plugins: [buildInputRules(schema)],
  })
  const dom = document.createElement('div')
  document.body.appendChild(dom)
  return new EditorView(dom, {
    state,
    nodeViews: {
      math_inline: mathInlineNodeView,
      math_block: mathBlockNodeView,
    },
  })
}

/** Simulate typing `text` into the view one character at a time. */
function typeText(view: EditorView, text: string): void {
  for (const char of text) {
    const { from, to } = view.state.selection
    const noop = () => view.state.tr
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, noop),
    )
    if (!handled) {
      view.dispatch(view.state.tr.insertText(char, from, to))
    }
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let view: EditorView | null = null

beforeEach(() => {
  view = null
})

afterEach(() => {
  if (view) {
    view.destroy()
    view = null
  }
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

describe('math schema nodes', () => {
  it('math_inline node exists with latex attr', () => {
    const nt = schema.nodes['math_inline']
    expect(nt).toBeDefined()
    expect(nt!.spec.attrs?.['latex']).toBeDefined()
    expect(nt!.spec.attrs?.['latex']?.default).toBe('')
  })

  it('math_block node exists with latex attr', () => {
    const nt = schema.nodes['math_block']
    expect(nt).toBeDefined()
    expect(nt!.spec.attrs?.['latex']).toBeDefined()
    expect(nt!.spec.attrs?.['latex']?.default).toBe('')
  })

  it('math_inline is inline and atom', () => {
    const nt = schema.nodes['math_inline']!
    expect(nt.spec.inline).toBe(true)
    expect(nt.spec.atom).toBe(true)
  })

  it('math_block is a block and atom', () => {
    const nt = schema.nodes['math_block']!
    expect(nt.spec.inline).toBeFalsy()
    expect(nt.spec.atom).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

describe('parseMarkdown - math_inline', () => {
  it('parses $x^2$ as math_inline with latex="x^2"', () => {
    const doc = parseMarkdown('$x^2$')
    const node = firstOfType(doc, 'math_inline')
    expect(node.attrs['latex']).toBe('x^2')
  })

  it('parses inline math in a sentence', () => {
    const doc = parseMarkdown('The value is $E = mc^2$ in physics.')
    const node = firstOfType(doc, 'math_inline')
    expect(node.attrs['latex']).toBe('E = mc^2')
  })

  it('parses $\\alpha + \\beta$ with backslashes', () => {
    const doc = parseMarkdown('$\\alpha + \\beta$')
    const node = firstOfType(doc, 'math_inline')
    expect(node.attrs['latex']).toBe('\\alpha + \\beta')
  })
})

describe('parseMarkdown - math_block', () => {
  it('parses $$....$$ block as math_block', () => {
    const doc = parseMarkdown('$$\n\\int_0^1 x\\,dx\n$$')
    const node = firstOfType(doc, 'math_block')
    expect(node.attrs['latex']).toBe('\\int_0^1 x\\,dx')
  })

  it('parses a block with multiple lines', () => {
    const doc = parseMarkdown('$$\na = b\nc = d\n$$')
    const node = firstOfType(doc, 'math_block')
    expect(node.attrs['latex']).toBe('a = b\nc = d')
  })
})

describe('parseMarkdown - digit-guard (no false positives)', () => {
  it('$5 and $10 does not become math_inline', () => {
    const doc = parseMarkdown('I have $5 and $10 in my wallet.')
    let found = false
    doc.descendants((node) => {
      if (node.type.name === 'math_inline') found = true
      return !found
    })
    expect(found).toBe(false)
  })

  it('\\$ escaped dollar is not math', () => {
    // An escaped dollar should be treated as literal text, not math
    const doc = parseMarkdown('cost is \\$5')
    let found = false
    doc.descendants((node) => {
      if (node.type.name === 'math_inline') found = true
      return !found
    })
    expect(found).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Serializer / round-trip
// ---------------------------------------------------------------------------

describe('serializer round-trip', () => {
  it('$x^2$ round-trips exactly', () => {
    expect(rt('$x^2$')).toBe('$x^2$')
  })

  it('inline math in a sentence round-trips', () => {
    expect(rt('a $x$ b')).toBe('a $x$ b')
  })

  it('block math round-trips exactly', () => {
    expect(rt('$$\n\\int_0^1\n$$')).toBe('$$\n\\int_0^1\n$$')
  })

  it('block math with multi-line content round-trips', () => {
    const md = '$$\na + b\nc = d\n$$'
    expect(rt(md)).toBe(md)
  })
})

// ---------------------------------------------------------------------------
// NodeView DOM rendering
// ---------------------------------------------------------------------------

describe('mathInlineNodeView DOM rendering', () => {
  it('renders KaTeX output (.katex) inside .math-inline', () => {
    view = mountView('$x^2$')
    const mathEl = document.querySelector('.math-inline')
    expect(mathEl).not.toBeNull()
    // KaTeX appends a .katex element inside our wrapper
    const katex = mathEl!.querySelector('.katex')
    expect(katex).not.toBeNull()
  })

  it('renders placeholder for empty math_inline', () => {
    view = mountView('')
    // Create a state with an empty math_inline node manually
    const mathNode = schema.nodes['math_inline']!.create({ latex: '' })
    const doc = schema.nodes['doc']!.create(
      {},
      schema.nodes['paragraph']!.create({}, mathNode),
    )
    const state = EditorState.create({ schema, doc, plugins: [buildInputRules(schema)] })
    const dom = document.createElement('div')
    document.body.appendChild(dom)
    const v = new EditorView(dom, {
      state,
      nodeViews: { math_inline: mathInlineNodeView, math_block: mathBlockNodeView },
    })
    view = v
    const mathEl = document.querySelector('.math-inline')
    expect(mathEl).not.toBeNull()
    expect(mathEl!.textContent).toContain('$')
  })
})

describe('mathBlockNodeView DOM rendering', () => {
  it('renders KaTeX output (.katex) inside .math-block', () => {
    view = mountView('$$\n\\int_0^1 x\\,dx\n$$')
    const mathEl = document.querySelector('.math-block')
    expect(mathEl).not.toBeNull()
    const katex = mathEl!.querySelector('.katex')
    expect(katex).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Input rules
// ---------------------------------------------------------------------------

describe('math_inline input rule', () => {
  it('typing $x$ produces a math_inline node', () => {
    const state = EditorState.create({ schema, plugins: [buildInputRules(schema)] })
    const dom = document.createElement('div')
    document.body.appendChild(dom)
    const v = new EditorView(dom, { state })
    view = v
    typeText(v, '$x$')
    let found = false
    v.state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') found = true
      return !found
    })
    expect(found).toBe(true)
  })

  it('typing $x^2$ produces math_inline with correct latex', () => {
    const state = EditorState.create({ schema, plugins: [buildInputRules(schema)] })
    const dom = document.createElement('div')
    document.body.appendChild(dom)
    const v = new EditorView(dom, { state })
    view = v
    typeText(v, '$x^2$')
    let latex: string | null = null
    v.state.doc.descendants((node) => {
      if (node.type.name === 'math_inline') {
        latex = node.attrs['latex'] as string
      }
      return latex === null
    })
    expect(latex).toBe('x^2')
  })
})
