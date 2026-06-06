/**
 * slashMenu.test.ts
 *
 * TDD tests for the `/` block-insert menu plugin.
 *
 * The plugin tracks `{ open, from, query }` in its state. Activation is
 * precise: it fires ONLY when the cursor sits at the end of a paragraph whose
 * text is exactly `/<query>` from the block start. This guarantees a literal
 * slash typed mid-sentence (e.g. "a/b" or "and/or") never opens the menu.
 *
 * `insertBlock` removes the `/query` text and then performs the item's
 * insertion/command, reusing editorCommandMap for the standard nodes and
 * bespoke logic for table / math_block / diagram / image.
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { schema } from '../../../src/renderer/editor/schema'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import {
  slashMenuPlugin,
  slashMenuKey,
  insertBlock,
  SLASH_ITEMS,
} from '../../../src/renderer/editor/plugins/slashMenu'
import { fuzzyFilter } from '../../../src/renderer/commands/fuzzy'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a state holding a single paragraph with `text` and the cursor at
 * `cursor` (defaults to the end of the text), with the slash plugin installed.
 */
function paraState(text: string, cursor?: number): EditorState {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  const pos = cursor ?? 1 + text.length
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, pos),
    plugins: [slashMenuPlugin()],
  })
}

/** Read the plugin's tracked state. */
function slashState(state: EditorState) {
  return slashMenuKey.getState(state)!
}

/**
 * Simulate typing `text` character by character into an empty paragraph,
 * returning the final state. Each character is inserted at the cursor through a
 * real transaction so the plugin's `apply` runs exactly as it would live.
 */
function typeInto(text: string): EditorState {
  let state = paraState('')
  for (const ch of text) {
    const tr = state.tr.insertText(ch, state.selection.from)
    state = state.apply(tr)
  }
  return state
}

/** Run insertBlock against a state and return the resulting serialized markdown. */
function insertAndSerialize(state: EditorState, itemId: string): string {
  let next = state
  insertBlock(state, itemId, (tr) => {
    next = state.apply(tr)
  })
  return serializeMarkdown(next.doc).trim()
}

// ---------------------------------------------------------------------------
// Activation detection
// ---------------------------------------------------------------------------

describe('slashMenuPlugin - activation', () => {
  it('starts closed in an empty paragraph', () => {
    expect(slashState(paraState('')).open).toBe(false)
  })

  it('opens when "/" is typed at the start of an empty paragraph', () => {
    const state = typeInto('/')
    const s = slashState(state)
    expect(s.open).toBe(true)
    expect(s.query).toBe('')
    // `from` points at the slash character itself (doc pos 1 here).
    expect(s.from).toBe(1)
  })

  it('updates the query as more characters are typed after "/"', () => {
    const state = typeInto('/head')
    const s = slashState(state)
    expect(s.open).toBe(true)
    expect(s.query).toBe('head')
  })

  it('does NOT open for "/" typed mid-sentence (after "a/")', () => {
    const state = typeInto('a/')
    expect(slashState(state).open).toBe(false)
  })

  it('does NOT open for "/" inside a word ("and/or")', () => {
    const state = typeInto('and/or')
    expect(slashState(state).open).toBe(false)
  })

  it('does NOT open in a non-empty paragraph where "/" is not at the start', () => {
    // Paragraph "hello" with the cursor at the end, then type "/".
    let state = paraState('hello')
    const tr = state.tr.insertText('/', state.selection.from)
    state = state.apply(tr)
    expect(slashState(state).open).toBe(false)
  })

  it('closes when the "/" is removed', () => {
    let state = typeInto('/h')
    expect(slashState(state).open).toBe(true)
    // Delete back to empty (remove "h" then "/").
    state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from))
    state = state.apply(state.tr.delete(state.selection.from - 1, state.selection.from))
    expect(slashState(state).open).toBe(false)
  })

  it('closes when the selection leaves the slash range', () => {
    const opened = typeInto('/code')
    expect(slashState(opened).open).toBe(true)
    // Move the cursor to the document start (pos 1, before the slash content
    // boundary). The cursor is no longer at the end of the slash query.
    const moved = opened.apply(
      opened.tr.setSelection(TextSelection.create(opened.doc, 1)),
    )
    expect(slashState(moved).open).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// insertBlock - removes the /query and performs the item action
// ---------------------------------------------------------------------------

describe('insertBlock', () => {
  it('heading1 produces a level-1 heading', () => {
    // An empty heading serializes to its bare ATX marker.
    const md = insertAndSerialize(typeInto('/h1'), 'heading1')
    expect(md).toBe('#')
  })

  it('heading2 produces a level-2 heading', () => {
    const md = insertAndSerialize(typeInto('/h2'), 'heading2')
    expect(md).toBe('##')
  })

  it('bulletList produces a bullet list', () => {
    const md = insertAndSerialize(typeInto('/bul'), 'bulletList')
    expect(md.startsWith('*') || md.startsWith('-')).toBe(true)
  })

  it('codeBlock produces a fenced code block', () => {
    const md = insertAndSerialize(typeInto('/code'), 'codeBlock')
    expect(md).toContain('```')
  })

  it('horizontalRule produces an hr', () => {
    const state = typeInto('/hr')
    let next = state
    insertBlock(state, 'horizontalRule', (tr) => {
      next = state.apply(tr)
    })
    let hasHr = false
    next.doc.descendants((node) => {
      if (node.type.name === 'horizontal_rule') hasHr = true
    })
    expect(hasHr).toBe(true)
  })

  it('mathBlock produces a math_block node', () => {
    const state = typeInto('/math')
    let next = state
    insertBlock(state, 'mathBlock', (tr) => {
      next = state.apply(tr)
    })
    let hasMath = false
    next.doc.descendants((node) => {
      if (node.type.name === 'math_block') hasMath = true
    })
    expect(hasMath).toBe(true)
  })

  it('table produces a table node', () => {
    const state = typeInto('/table')
    let next = state
    insertBlock(state, 'table', (tr) => {
      next = state.apply(tr)
    })
    let rows = 0
    let cells = 0
    next.doc.descendants((node) => {
      if (node.type.name === 'table_row') rows++
      if (node.type.name === 'table_cell' || node.type.name === 'table_header') cells++
    })
    expect(rows).toBe(2)
    expect(cells).toBe(4)
  })

  it('diagram produces a mermaid code block with starter graph', () => {
    const state = typeInto('/diagram')
    let next = state
    insertBlock(state, 'diagram', (tr) => {
      next = state.apply(tr)
    })
    let lang = ''
    let text = ''
    next.doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        lang = node.attrs['language'] as string
        text = node.textContent
      }
    })
    expect(lang).toBe('mermaid')
    expect(text.length).toBeGreaterThan(0)
  })

  it('removes the "/query" text (no stray slash left behind)', () => {
    const md = insertAndSerialize(typeInto('/h1'), 'heading1')
    expect(md).not.toContain('/')
  })

  it('returns false for an unknown item id', () => {
    const state = typeInto('/h1')
    expect(insertBlock(state, 'nonexistent', () => {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Filtering (the menu component reuses fuzzyFilter over SLASH_ITEMS)
// ---------------------------------------------------------------------------

describe('SLASH_ITEMS filtering', () => {
  const keyFn = (item: (typeof SLASH_ITEMS)[number]): string =>
    `${item.label} ${item.keywords.join(' ')}`

  it('exposes all the documented items', () => {
    const ids = SLASH_ITEMS.map((i) => i.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'heading1', 'heading2', 'heading3', 'bulletList', 'orderedList',
        'taskList', 'blockquote', 'codeBlock', 'table', 'mathBlock',
        'diagram', 'horizontalRule', 'image',
      ]),
    )
  })

  it('"head" matches the heading items', () => {
    const results = fuzzyFilter('head', SLASH_ITEMS, keyFn).map((m) => m.item.id)
    expect(results).toContain('heading1')
    expect(results).toContain('heading2')
    expect(results).toContain('heading3')
  })

  it('"code" matches the Code Block item', () => {
    const results = fuzzyFilter('code', SLASH_ITEMS, keyFn).map((m) => m.item.id)
    expect(results).toContain('codeBlock')
  })

  it('"table" matches the Table item and not headings', () => {
    const results = fuzzyFilter('table', SLASH_ITEMS, keyFn).map((m) => m.item.id)
    expect(results).toContain('table')
    expect(results).not.toContain('heading1')
  })

  it('an empty query returns every item in original order', () => {
    const results = fuzzyFilter('', SLASH_ITEMS, keyFn)
    expect(results.length).toBe(SLASH_ITEMS.length)
  })
})
