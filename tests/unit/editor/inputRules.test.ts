/**
 * Tests for src/renderer/editor/inputRules.ts
 *
 * Harness: mountView / typeText simulate the ProseMirror input-rule flow
 * without a real DOM EditorView. We build a real EditorState, call each
 * rule's handler directly, and assert the resulting transaction applied the
 * expected mark to the inner text.
 */
import { describe, it, expect } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { type MarkType } from 'prosemirror-model'
import { schema } from '../../../src/renderer/editor/schema'
import { markRules } from '../../../src/renderer/editor/inputRules'

/** Retrieve a mark type that is guaranteed to exist in our schema. */
function schemamark(name: string): MarkType {
  const mt = schema.marks[name]
  if (!mt) throw new Error(`Unknown mark type: ${name}`)
  return mt
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface View {
  state: EditorState
}

/**
 * Create a view whose paragraph content is `text` with the cursor at the end.
 */
function mountView(text: string): View {
  const doc = schema.node('doc', null, [
    schema.node('paragraph', null, text ? [schema.text(text)] : []),
  ])
  // Position 1 = start of paragraph content; text.length + 1 = end of content
  const sel = TextSelection.create(doc, text.length + 1)
  return { state: EditorState.create({ doc, selection: sel }) }
}

/**
 * Internal shape of an InputRule as exposed at runtime (the `match` and
 * `handler` properties are marked @internal in the type defs but are
 * reliably present on the object).
 */
interface RuleInternal {
  match: RegExp
  handler: (
    state: EditorState,
    match: RegExpExecArray,
    start: number,
    end: number,
  ) => ReturnType<EditorState['tr']['replaceWith']> | null
}

/**
 * Append `char` to the view state, then run all markRules.
 * Mirrors the logic inside prosemirror-inputrules `run()`:
 *   textBefore = text in the paragraph up to (and including) the new char.
 */
function typeText(view: View, char: string): View {
  // Insert the character so the document reflects the full typed string
  const insertTr = view.state.tr.insertText(char)
  let state = view.state.apply(insertTr)

  const $cursor = (state.selection as TextSelection).$cursor
  if (!$cursor) return { state }

  // textBefore is measured AFTER insertion (cursor already past the new char)
  const MAX_MATCH = 500
  const textBefore = $cursor.parent.textBetween(
    Math.max(0, $cursor.parentOffset - MAX_MATCH),
    $cursor.parentOffset,
    null,
    '￼',
  )

  const from = $cursor.pos // end of match range (cursor position)

  for (const rule of markRules) {
    const r = rule as unknown as RuleInternal
    const match = r.match.exec(textBefore)
    if (!match || !match[0]) continue

    // startPos: position where the matched text begins in the document
    const startPos = from - match[0].length

    const tr = r.handler(state, match, startPos, from)
    if (tr) {
      state = state.apply(tr)
      break
    }
  }

  return { state }
}

// ---------------------------------------------------------------------------
// Assertion helper
// ---------------------------------------------------------------------------

/**
 * Return true if the document contains a text node equal to `text` that
 * carries the given mark.
 */
function hasMarkOnText(
  state: EditorState,
  markType: MarkType,
  text: string,
): boolean {
  let found = false
  state.doc.descendants((node) => {
    if (node.isText && node.text === text && markType.isInSet(node.marks)) {
      found = true
    }
  })
  return found
}

// ---------------------------------------------------------------------------
// Tests: asterisk variants (regression guard — these worked before the fix)
// ---------------------------------------------------------------------------

describe('markInputRule - asterisk variants (regression guard)', () => {
  it('applies strong mark for **bold**', () => {
    const view = mountView('**hello*')
    const updated = typeText(view, '*')
    expect(hasMarkOnText(updated.state, schemamark('strong'), 'hello')).toBe(true)
  })

  it('applies em mark for *italic*', () => {
    const view = mountView('*hello')
    const updated = typeText(view, '*')
    expect(hasMarkOnText(updated.state, schemamark('em'), 'hello')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: underscore variants (these are broken by the bug; fixed by the patch)
// ---------------------------------------------------------------------------

describe('markInputRule - underscore variants (bug fix)', () => {
  it('applies strong mark for __bold__', () => {
    const view = mountView('__hello_')
    const updated = typeText(view, '_')
    expect(hasMarkOnText(updated.state, schemamark('strong'), 'hello')).toBe(true)
  })

  it('applies em mark for _italic_', () => {
    const view = mountView('_hello')
    const updated = typeText(view, '_')
    expect(hasMarkOnText(updated.state, schemamark('em'), 'hello')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: single-group rules (code, strikethrough) - no regression
// ---------------------------------------------------------------------------

describe('markInputRule - single-group rules (code and strikethrough)', () => {
  it('applies code mark for `code`', () => {
    const view = mountView('`hello')
    const updated = typeText(view, '`')
    expect(hasMarkOnText(updated.state, schemamark('code'), 'hello')).toBe(true)
  })

  it('applies strikethrough mark for ~~text~~', () => {
    const view = mountView('~~hello~')
    const updated = typeText(view, '~')
    expect(hasMarkOnText(updated.state, schemamark('strikethrough'), 'hello')).toBe(true)
  })
})
