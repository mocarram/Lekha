import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '@renderer/editor/parser'
import { countWords } from '@renderer/editor/wordCount'

describe('countWords', () => {
  it('counts words and chars', () => {
    const c = countWords(parseMarkdown('Hello world, foo'))
    expect(c.words).toBe(3)
    expect(c.chars).toBe('Hello world, foo'.length)
  })

  it('counts across multiple blocks', () => {
    const c = countWords(parseMarkdown('# Title\n\ntwo words'))
    expect(c.words).toBe(3) // Title + two + words
  })

  it('empty doc is zero', () => {
    expect(countWords(parseMarkdown(''))).toEqual({ words: 0, chars: 0 })
  })

  it('includes code block text in counts', () => {
    // Code blocks are included (WYSIWYG behavior).
    // The fenced block content is "foo bar" (trailing newline stripped by parser).
    const c = countWords(parseMarkdown('```\nfoo bar\n```'))
    expect(c.words).toBe(2)
    expect(c.chars).toBe('foo bar'.length)
  })

  it('words at block boundaries are not merged', () => {
    // "end" and "start" are in separate blocks — they must count as 2 words
    const c = countWords(parseMarkdown('end\n\nstart'))
    expect(c.words).toBe(2)
  })

  it('inline marks do not affect word count', () => {
    // **bold** text has the same word count as plain bold text
    const c = countWords(parseMarkdown('**bold** text'))
    expect(c.words).toBe(2)
    expect(c.chars).toBe('bold text'.length)
  })
})
