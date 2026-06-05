import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'

describe('getOutline', () => {
  it('extracts headings with level/text/pos', () => {
    const out = getOutline(parseMarkdown('# A\n\n## B\n\ntext\n\n## C'))
    expect(out.map((o) => [o.level, o.text])).toEqual([
      [1, 'A'],
      [2, 'B'],
      [2, 'C'],
    ])
    expect(out.every((o) => typeof o.pos === 'number')).toBe(true)
  })

  it('returns [] for an empty doc', () => {
    expect(getOutline(parseMarkdown(''))).toEqual([])
  })

  it('extracts plain text from headings that contain inline marks', () => {
    // ## **bold** title  =>  text content is "bold title"
    const out = getOutline(parseMarkdown('## **bold** title'))
    expect(out).toHaveLength(1)
    expect(out[0]!.text).toBe('bold title')
    expect(out[0]!.level).toBe(2)
  })

  it('returns headings in document order', () => {
    const out = getOutline(parseMarkdown('### C\n\n# A\n\n## B'))
    expect(out.map((o) => o.text)).toEqual(['C', 'A', 'B'])
  })

  it('pos values are increasing', () => {
    const out = getOutline(parseMarkdown('# First\n\n## Second\n\n### Third'))
    expect(out[0]!.pos).toBeLessThan(out[1]!.pos)
    expect(out[1]!.pos).toBeLessThan(out[2]!.pos)
  })
})
