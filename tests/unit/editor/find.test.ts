/**
 * Unit tests for find.ts - pure search/replace helpers.
 *
 * We use parseMarkdown to build ProseMirror documents and then verify
 * that findMatches returns accurate {from, to} positions, verified via
 * doc.textBetween() to avoid any off-by-one assumptions.
 */

import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { createEditorState } from '../../../src/renderer/editor/createState'
import { findMatches, replaceAllTr } from '../../../src/renderer/editor/find'

// ---------------------------------------------------------------------------
// findMatches — basic
// ---------------------------------------------------------------------------

describe('findMatches - basic', () => {
  it('returns [] for an empty query', () => {
    const doc = parseMarkdown('foo bar')
    expect(findMatches(doc, '', { caseSensitive: true })).toEqual([])
  })

  it('returns [] when query is not found', () => {
    const doc = parseMarkdown('foo bar')
    expect(findMatches(doc, 'baz', { caseSensitive: true })).toEqual([])
  })

  it('finds a single occurrence in a paragraph', () => {
    const doc = parseMarkdown('hello world')
    const matches = findMatches(doc, 'world', { caseSensitive: true })
    expect(matches).toHaveLength(1)
    // Verify position via doc.textBetween
    const [m] = matches
    expect(doc.textBetween(m!.from, m!.to)).toBe('world')
  })

  it('finds two non-overlapping occurrences: "foo bar foo"', () => {
    const doc = parseMarkdown('foo bar foo')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(2)
    for (const m of matches) {
      expect(doc.textBetween(m.from, m.to)).toBe('foo')
    }
    // Second match starts after first ends
    expect(matches[1]!.from).toBeGreaterThan(matches[0]!.to)
  })

  it('returns correct from/to so textBetween gives the matched text', () => {
    const doc = parseMarkdown('abc foo def foo ghi')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(2)
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to)).toBe('foo')
    expect(doc.textBetween(matches[1]!.from, matches[1]!.to)).toBe('foo')
  })
})

// ---------------------------------------------------------------------------
// findMatches — case sensitivity
// ---------------------------------------------------------------------------

describe('findMatches - case sensitivity', () => {
  it('case-insensitive: finds "Foo" and "foo" when querying "foo"', () => {
    const doc = parseMarkdown('Foo foo')
    const matches = findMatches(doc, 'foo', { caseSensitive: false })
    expect(matches).toHaveLength(2)
  })

  it('case-sensitive: finds only "foo" (lowercase) when querying "foo"', () => {
    const doc = parseMarkdown('Foo foo')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to)).toBe('foo')
  })

  it('case-insensitive: matches mixed case target', () => {
    const doc = parseMarkdown('Hello HELLO hello')
    const matches = findMatches(doc, 'hello', { caseSensitive: false })
    expect(matches).toHaveLength(3)
  })

  it('case-sensitive: exact match only', () => {
    const doc = parseMarkdown('Hello HELLO hello')
    const matches = findMatches(doc, 'HELLO', { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to)).toBe('HELLO')
  })
})

// ---------------------------------------------------------------------------
// findMatches — multiple blocks
// ---------------------------------------------------------------------------

describe('findMatches - multiple blocks', () => {
  it('finds matches across a heading and a paragraph', () => {
    // "# foo\n\nfoo bar" produces: heading "foo", paragraph "foo bar"
    const doc = parseMarkdown('# foo\n\nfoo bar')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(2)
    for (const m of matches) {
      expect(doc.textBetween(m.from, m.to)).toBe('foo')
    }
  })

  it('finds matches in different paragraphs', () => {
    const doc = parseMarkdown('first foo\n\nsecond foo\n\nthird bar')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(2)
    for (const m of matches) {
      expect(doc.textBetween(m.from, m.to)).toBe('foo')
    }
  })

  it('does not match across block boundaries', () => {
    // "bar\n\nbaz" - "barbaz" would match if naively concatenated, but must not
    const doc = parseMarkdown('bar\n\nbaz')
    const matches = findMatches(doc, 'barbaz', { caseSensitive: true })
    expect(matches).toHaveLength(0)
  })

  it('finds a match in a list item', () => {
    const doc = parseMarkdown('- item with foo\n- other item')
    const matches = findMatches(doc, 'foo', { caseSensitive: true })
    expect(matches).toHaveLength(1)
    expect(doc.textBetween(matches[0]!.from, matches[0]!.to)).toBe('foo')
  })
})

// ---------------------------------------------------------------------------
// replaceAllTr
// ---------------------------------------------------------------------------

describe('replaceAllTr', () => {
  it('replaces all occurrences and returns count', () => {
    const state = createEditorState('foo bar foo')
    const { tr, count } = replaceAllTr(state, 'foo', 'baz', { caseSensitive: true })
    expect(count).toBe(2)

    const newState = state.apply(tr)
    // The resulting doc text should have "baz" where "foo" was
    expect(newState.doc.textContent).toBe('baz bar baz')
  })

  it('returns count=0 and a no-op tr for empty query', () => {
    const state = createEditorState('hello world')
    const { tr, count } = replaceAllTr(state, '', 'baz', { caseSensitive: true })
    expect(count).toBe(0)
    // No-op transaction: doc content unchanged
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('hello world')
  })

  it('returns count=0 when query has no matches', () => {
    const state = createEditorState('hello world')
    const { tr, count } = replaceAllTr(state, 'xyz', 'abc', { caseSensitive: true })
    expect(count).toBe(0)
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('hello world')
  })

  it('replaces single occurrence', () => {
    const state = createEditorState('hello world')
    const { tr, count } = replaceAllTr(state, 'world', 'there', { caseSensitive: true })
    expect(count).toBe(1)
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('hello there')
  })

  it('replaces case-insensitively when caseSensitive is false', () => {
    const state = createEditorState('Foo foo FOO')
    const { tr, count } = replaceAllTr(state, 'foo', 'bar', { caseSensitive: false })
    expect(count).toBe(3)
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('bar bar bar')
  })

  it('handles replacement with longer string (positions shift correctly)', () => {
    const state = createEditorState('a b a')
    const { tr, count } = replaceAllTr(state, 'a', 'long', { caseSensitive: true })
    expect(count).toBe(2)
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('long b long')
  })

  it('handles replacement with shorter string', () => {
    const state = createEditorState('hello world hello')
    const { tr, count } = replaceAllTr(state, 'hello', 'hi', { caseSensitive: true })
    expect(count).toBe(2)
    const newState = state.apply(tr)
    expect(newState.doc.textContent).toBe('hi world hi')
  })

  it('replaces across multiple blocks', () => {
    const state = createEditorState('foo paragraph\n\nfoo other')
    const { tr, count } = replaceAllTr(state, 'foo', 'bar', { caseSensitive: true })
    expect(count).toBe(2)
    const newState = state.apply(tr)
    // Each block now has "bar" instead of "foo"
    const blockTexts: string[] = []
    newState.doc.descendants((node) => {
      if (node.isTextblock) {
        blockTexts.push(node.textContent)
        return false
      }
      return true
    })
    expect(blockTexts[0]).toBe('bar paragraph')
    expect(blockTexts[1]).toBe('bar other')
  })
})
