import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { type Node } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'
import { buildInputRules } from '../../../src/renderer/editor/inputRules'

// ---------------------------------------------------------------------------
// Test harness helpers
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
    // handleTextInput takes (view, from, to, text, deflt) in newer PM versions.
    // We pass a no-op default; the plugin's handleTextInput fires if matched.
    const noop = () => view.state.tr
    const handled = view.someProp('handleTextInput', (f) =>
      f(view, from, to, char, noop),
    )
    if (!handled) {
      view.dispatch(
        view.state.tr.insertText(char, from, to),
      )
    }
  }
}

/** First child of the doc (the top-level block). */
function firstBlock(view: EditorView): Node {
  return view.state.doc.firstChild!
}

/** Does `view` contain a text node with the given mark at the top level? */
function hasMark(view: EditorView, markName: string, text: string): boolean {
  let found = false
  view.state.doc.descendants((node) => {
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

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let view: EditorView

beforeEach(() => {
  view = mountView()
})

afterEach(() => {
  view.destroy()
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// Block input rules
// ---------------------------------------------------------------------------

describe('heading input rule', () => {
  it('# + space -> heading level 1', () => {
    typeText(view, '# ')
    expect(firstBlock(view).type.name).toBe('heading')
    expect(firstBlock(view).attrs['level']).toBe(1)
  })

  it('## + space -> heading level 2', () => {
    typeText(view, '## ')
    expect(firstBlock(view).type.name).toBe('heading')
    expect(firstBlock(view).attrs['level']).toBe(2)
  })

  it('###### + space -> heading level 6', () => {
    typeText(view, '###### ')
    expect(firstBlock(view).type.name).toBe('heading')
    expect(firstBlock(view).attrs['level']).toBe(6)
  })
})

describe('blockquote input rule', () => {
  it('> + space -> blockquote', () => {
    typeText(view, '> ')
    expect(firstBlock(view).type.name).toBe('blockquote')
  })
})

describe('bullet list input rule', () => {
  it('- + space -> bullet_list', () => {
    typeText(view, '- ')
    expect(firstBlock(view).type.name).toBe('bullet_list')
  })

  it('* + space -> bullet_list', () => {
    typeText(view, '* ')
    expect(firstBlock(view).type.name).toBe('bullet_list')
  })

  it('+ + space -> bullet_list', () => {
    typeText(view, '+ ')
    expect(firstBlock(view).type.name).toBe('bullet_list')
  })
})

describe('ordered list input rule', () => {
  it('1. + space -> ordered_list', () => {
    typeText(view, '1. ')
    expect(firstBlock(view).type.name).toBe('ordered_list')
  })
})

describe('code block input rule', () => {
  it('``` + space -> code_block', () => {
    typeText(view, '``` ')
    expect(firstBlock(view).type.name).toBe('code_block')
  })

  it('```js + space -> code_block with language', () => {
    typeText(view, '```js ')
    const block = firstBlock(view)
    expect(block.type.name).toBe('code_block')
    expect(block.attrs['language']).toBe('js')
  })
})

describe('horizontal rule input rule', () => {
  it('--- -> horizontal_rule', () => {
    typeText(view, '---')
    expect(firstBlock(view).type.name).toBe('horizontal_rule')
  })

  it('*** -> horizontal_rule', () => {
    typeText(view, '***')
    expect(firstBlock(view).type.name).toBe('horizontal_rule')
  })

  it('___ -> horizontal_rule', () => {
    typeText(view, '___')
    expect(firstBlock(view).type.name).toBe('horizontal_rule')
  })
})

// ---------------------------------------------------------------------------
// Inline mark input rules (asterisk variants - regression)
// ---------------------------------------------------------------------------

describe('strong mark input rule (** variant, regression)', () => {
  it('**bold** -> strong mark', () => {
    typeText(view, '**bold**')
    expect(hasMark(view, 'strong', 'bold')).toBe(true)
  })
})

describe('em mark input rule (* variant, regression)', () => {
  it('*italic* -> em mark', () => {
    typeText(view, '*italic*')
    expect(hasMark(view, 'em', 'italic')).toBe(true)
  })
})

describe('code mark input rule (regression)', () => {
  it('`code` -> code mark', () => {
    typeText(view, '`code`')
    expect(hasMark(view, 'code', 'code')).toBe(true)
  })
})

describe('strikethrough mark input rule (regression)', () => {
  it('~~text~~ -> strikethrough mark', () => {
    typeText(view, '~~text~~')
    expect(hasMark(view, 'strikethrough', 'text')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// KNOWN FIX: underscore variants use match[2], not match[1]
// ---------------------------------------------------------------------------

describe('strong mark input rule (__ variant, KNOWN FIX)', () => {
  it('__bold__ -> strong mark (would silently fail before fix)', () => {
    typeText(view, '__bold__')
    expect(hasMark(view, 'strong', 'bold')).toBe(true)
  })
})

describe('em mark input rule (_ variant, KNOWN FIX)', () => {
  it('_italic_ -> em mark (would silently fail before fix)', () => {
    typeText(view, '_italic_')
    expect(hasMark(view, 'em', 'italic')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Task-list input rule: `[ ] ` / `[] ` / `[x] ` -> task_list > task_item
// ---------------------------------------------------------------------------

describe('task-list input rule', () => {
  it('[ ] + space -> unchecked task item', () => {
    typeText(view, '[ ] ')
    const block = firstBlock(view)
    expect(block.type.name).toBe('task_list')
    expect(block.firstChild!.type.name).toBe('task_item')
    expect(block.firstChild!.attrs['checked']).toBe(false)
  })

  it('[] + space (empty brackets) -> unchecked task item', () => {
    typeText(view, '[] ')
    const block = firstBlock(view)
    expect(block.type.name).toBe('task_list')
    expect(block.firstChild!.attrs['checked']).toBe(false)
  })

  it('[x] + space -> checked task item', () => {
    typeText(view, '[x] ')
    const block = firstBlock(view)
    expect(block.type.name).toBe('task_list')
    expect(block.firstChild!.attrs['checked']).toBe(true)
  })

  it('[X] + space (uppercase) -> checked task item', () => {
    typeText(view, '[X] ')
    expect(firstBlock(view).firstChild!.attrs['checked']).toBe(true)
  })

  it('does not fire inside an existing bullet list item', () => {
    typeText(view, '- ')
    expect(firstBlock(view).type.name).toBe('bullet_list')
    typeText(view, '[ ] ')
    // Still a bullet list - the marker text is left as-is, not converted.
    expect(firstBlock(view).type.name).toBe('bullet_list')
  })
})

// ---------------------------------------------------------------------------
// Block-equation input rule: `$$` at start of empty paragraph -> math_block
// ---------------------------------------------------------------------------

describe('block-equation input rule', () => {
  it('$$ at the start of an empty paragraph inserts a math_block', () => {
    typeText(view, '$$')
    expect(firstBlock(view).type.name).toBe('math_block')
  })

  it('does not fire when there is already text in the paragraph', () => {
    typeText(view, 'x')
    typeText(view, '$$')
    // Still a paragraph - the marker stays literal text.
    expect(firstBlock(view).type.name).toBe('paragraph')
  })
})
