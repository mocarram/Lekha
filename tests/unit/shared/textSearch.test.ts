import { describe, it, expect } from 'vitest'
import { findMatchRanges, replaceAllInText } from '../../../src/shared/textSearch'

describe('findMatchRanges', () => {
  it('returns [] for an empty query', () => {
    expect(findMatchRanges('hello', '', { caseSensitive: false, wholeWord: false })).toEqual([])
  })
  it('finds all non-overlapping occurrences (case-insensitive)', () => {
    expect(findMatchRanges('Foo foo FOO', 'foo', { caseSensitive: false, wholeWord: false }))
      .toEqual([[0, 3], [4, 7], [8, 11]])
  })
  it('respects case sensitivity', () => {
    expect(findMatchRanges('Foo foo', 'foo', { caseSensitive: true, wholeWord: false }))
      .toEqual([[4, 7]])
  })
  it('whole-word excludes substrings inside larger words', () => {
    expect(findMatchRanges('cat cats scatter cat.', 'cat', { caseSensitive: false, wholeWord: true }))
      .toEqual([[0, 3], [17, 20]])
  })
  it('whole-word treats underscores/digits as word chars', () => {
    expect(findMatchRanges('a_b ab', 'a', { caseSensitive: false, wholeWord: true })).toEqual([])
  })
})

describe('replaceAllInText', () => {
  it('returns the text unchanged with count 0 when there is no match', () => {
    expect(replaceAllInText('hello', 'zz', 'x', { caseSensitive: false, wholeWord: false }))
      .toEqual({ text: 'hello', count: 0 })
  })
  it('replaces every match and reports the count', () => {
    expect(replaceAllInText('Foo foo', 'foo', 'bar', { caseSensitive: false, wholeWord: false }))
      .toEqual({ text: 'bar bar', count: 2 })
  })
  it('preserves the original casing of surrounding text', () => {
    expect(replaceAllInText('The CAT sat', 'cat', 'dog', { caseSensitive: false, wholeWord: true }))
      .toEqual({ text: 'The dog sat', count: 1 })
  })
})
