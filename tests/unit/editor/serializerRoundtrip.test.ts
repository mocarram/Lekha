/**
 * Regression tests for serializer round-trip data-loss bugs found in the
 * round-2 correctness audit.
 *
 *   Bug 1: table cell backslashes were double-escaped, growing unbounded on
 *          each save (a\b -> a\\b -> a\\\\b ...).
 *   Bug 2: a literal "$x$" in a text node serialized as "$x$" and re-parsed
 *          into an inline-math node, changing the document's meaning.
 */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

/** markdown -> doc -> markdown */
const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

describe('serializer round-trip: table cell backslashes (bug 1)', () => {
  it('does not grow backslashes across repeated round-trips (idempotent)', () => {
    const input = '| a\\b | c |\n| --- | --- |\n| d | e |'
    const once = rt(input)
    const twice = rt(once)
    const thrice = rt(twice)
    // After the first normalization the output is a fixed point - no growth.
    expect(twice).toBe(once)
    expect(thrice).toBe(once)
    // And it never accumulates extra backslashes.
    const countBackslashes = (s: string): number => (s.match(/\\/g) ?? []).length
    expect(countBackslashes(twice)).toBe(countBackslashes(once))
  })

  it('preserves a single literal backslash in a cell through a round-trip', () => {
    const doc = parseMarkdown('| a\\b | c |\n| --- | --- |\n| d | e |')
    // The first body cell should carry the literal text "a\b" (one backslash).
    let cellText = ''
    doc.descendants((n) => {
      if (n.isText && n.text?.includes('a')) cellText = n.text
    })
    expect(cellText).toContain('a\\b')
  })
})

describe('serializer round-trip: literal $ in text (bug 2)', () => {
  it('keeps escaped "\\$x\\$" as literal text (not math) across a round-trip', () => {
    // Escaped dollars parse to the literal text "$notmath$" (NOT a math node).
    const md = rt('text \\$notmath\\$ text')
    // The serialized output re-escapes the dollars so they stay literal...
    expect(md).toContain('\\$notmath\\$')
    // ...and re-parsing keeps it as plain text, never an inline-math node.
    const doc = parseMarkdown(md)
    let hasMath = false
    doc.descendants((n) => {
      if (n.type.name === 'math_inline') hasMath = true
    })
    expect(hasMath).toBe(false)
  })

  it('is idempotent for escaped literal dollar text', () => {
    const once = rt('a \\$b\\$ c')
    expect(rt(once)).toBe(once)
  })

  it('still serializes real inline math as $...$ (not escaped)', () => {
    // A genuine inline-math node round-trips to unescaped $...$.
    const out = rt('inline $x^2$ math')
    expect(out).toContain('$x^2$')
    expect(out).not.toContain('\\$x^2\\$')
  })
})
