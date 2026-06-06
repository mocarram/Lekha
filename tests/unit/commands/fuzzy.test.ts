/**
 * Unit tests for the fuzzy matcher (src/renderer/commands/fuzzy.ts).
 *
 * fuzzyMatch is a pure subsequence matcher: every query character must appear
 * in the text in order (case-insensitive). The score rewards contiguous runs
 * and start-of-word matches so the most "obvious" hit ranks first.
 *
 * fuzzyFilter maps the matcher over a list, drops non-matches, and sorts by
 * descending score. An empty query returns every item in original order.
 */
import { describe, it, expect } from 'vitest'
import { fuzzyMatch, fuzzyFilter } from '../../../src/renderer/commands/fuzzy'

describe('fuzzyMatch - subsequence matching', () => {
  it('matches a contiguous substring', () => {
    const r = fuzzyMatch('bold', 'Bold')
    expect(r.matched).toBe(true)
    expect(r.indices).toEqual([0, 1, 2, 3])
  })

  it('matches a non-contiguous subsequence', () => {
    const r = fuzzyMatch('tsm', 'Toggle Source Mode')
    expect(r.matched).toBe(true)
    // T(0) ... S(7) ... M(14)
    expect(r.indices).toEqual([0, 7, 14])
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('BOLD', 'bold').matched).toBe(true)
    expect(fuzzyMatch('bold', 'BOLD').matched).toBe(true)
  })

  it('does not match when a character is missing', () => {
    const r = fuzzyMatch('xyz', 'Bold')
    expect(r.matched).toBe(false)
    expect(r.indices).toEqual([])
  })

  it('does not match when characters are out of order', () => {
    // "dlob" cannot be a subsequence of "bold"
    expect(fuzzyMatch('dlob', 'bold').matched).toBe(false)
  })

  it('matches an empty query against any text with no indices', () => {
    const r = fuzzyMatch('', 'anything')
    expect(r.matched).toBe(true)
    expect(r.indices).toEqual([])
  })
})

describe('fuzzyMatch - scoring', () => {
  it('scores a contiguous match higher than a scattered one', () => {
    // Same word, same length: "save" is contiguous in "Saved", but scattered
    // across "Separate Value" (S-a...v...e), so contiguity must win.
    const contiguous = fuzzyMatch('save', 'Saved')
    const scattered = fuzzyMatch('save', 'Separate Value')
    expect(contiguous.matched).toBe(true)
    expect(scattered.matched).toBe(true)
    expect(contiguous.score).toBeGreaterThan(scattered.score)
  })

  it('scores a start-of-word match higher than a mid-word match', () => {
    // "code" at the very start of "Code Block" vs inside "Inline Code"
    const startWord = fuzzyMatch('code', 'Code Block')
    const midWord = fuzzyMatch('code', 'Barcode')
    expect(startWord.score).toBeGreaterThan(midWord.score)
  })

  it('rewards matches that begin at index 0', () => {
    const atStart = fuzzyMatch('sa', 'Save')
    const later = fuzzyMatch('sa', 'Reveal in Sidebar')
    expect(atStart.score).toBeGreaterThan(later.score)
  })
})

describe('fuzzyFilter', () => {
  interface Item {
    label: string
  }
  const items: Item[] = [
    { label: 'Save' },
    { label: 'Save As' },
    { label: 'Bold' },
    { label: 'Bullet List' },
    { label: 'Code Block' },
  ]
  const key = (i: Item): string => i.label

  it('returns all items in original order for an empty query', () => {
    const out = fuzzyFilter('', items, key)
    expect(out.map((m) => m.item.label)).toEqual([
      'Save',
      'Save As',
      'Bold',
      'Bullet List',
      'Code Block',
    ])
  })

  it('filters out non-matching items', () => {
    const out = fuzzyFilter('save', items, key)
    const labels = out.map((m) => m.item.label)
    expect(labels).toContain('Save')
    expect(labels).toContain('Save As')
    expect(labels).not.toContain('Bold')
  })

  it('sorts matches by descending score (best first)', () => {
    const out = fuzzyFilter('save', items, key)
    // "Save" (whole word, exact) should rank above "Save As".
    expect(out[0]?.item.label).toBe('Save')
  })

  it('exposes the match indices for each result', () => {
    const out = fuzzyFilter('bl', items, key)
    const block = out.find((m) => m.item.label === 'Code Block')
    expect(block).toBeDefined()
    expect(block!.indices.length).toBe(2)
  })

  it('returns an empty array when nothing matches', () => {
    expect(fuzzyFilter('zzzz', items, key)).toEqual([])
  })
})
