import { describe, it, expect } from 'vitest'
import { documentStats } from '@renderer/editor/wordCount'

describe('documentStats', () => {
  it('computes all stats for a two-paragraph document', () => {
    const stats = documentStats('Hello world.\n\nSecond para line.')
    // Words: "Hello", "world.", "Second", "para", "line." = 5
    expect(stats.words).toBe(5)
    // Characters: full string length (newlines included).
    expect(stats.characters).toBe('Hello world.\n\nSecond para line.'.length)
    // Characters (no spaces): all whitespace removed (spaces + newlines).
    expect(stats.charactersNoSpaces).toBe(
      'Hello world.\n\nSecond para line.'.replace(/\s+/g, '').length,
    )
    // Lines: split on \n -> "Hello world.", "", "Second para line." = 3.
    expect(stats.lines).toBe(3)
    // Paragraphs: non-empty blocks separated by blank lines = 2.
    expect(stats.paragraphs).toBe(2)
    // Reading time: ceil(5 / 200) = 1.
    expect(stats.readingTimeMinutes).toBe(1)
  })

  it('returns all zeros for an empty string', () => {
    const stats = documentStats('')
    expect(stats).toEqual({
      words: 0,
      characters: 0,
      charactersNoSpaces: 0,
      lines: 0,
      paragraphs: 0,
      readingTimeMinutes: 0,
    })
  })

  it('returns all zeros for a whitespace-only string', () => {
    const stats = documentStats('   \n\n  \t ')
    expect(stats.words).toBe(0)
    expect(stats.paragraphs).toBe(0)
    expect(stats.readingTimeMinutes).toBe(0)
  })

  it('rounds reading time up (ceil words / 200)', () => {
    // 201 words -> ceil(201/200) = 2 minutes.
    const text = Array.from({ length: 201 }, () => 'word').join(' ')
    const stats = documentStats(text)
    expect(stats.words).toBe(201)
    expect(stats.readingTimeMinutes).toBe(2)
  })

  it('counts exactly 200 words as 1 minute', () => {
    const text = Array.from({ length: 200 }, () => 'word').join(' ')
    expect(documentStats(text).readingTimeMinutes).toBe(1)
  })

  it('counts a single line with no trailing newline as 1 line', () => {
    const stats = documentStats('one two three')
    expect(stats.lines).toBe(1)
    expect(stats.words).toBe(3)
    expect(stats.paragraphs).toBe(1)
  })
})
