/**
 * Column-alignment round-trip tests.
 *
 * GFM tables carry per-column alignment in the separator row:
 *   `:---` left, `:--:` center, `---:` right, `---` none.
 * markdown-it surfaces this as a `style: text-align:left|center|right` attr on
 * each `th`/`td`; the parser maps it to the cell's `align` attr, and the
 * serializer renders the separator markers from the header cells. These tests
 * pin the parse (cells carry the right `align`), the serialize (markers emitted)
 * and idempotency end-to-end through the real schema.
 */
import { describe, it, expect } from 'vitest'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

/** Round-trip: markdown -> doc -> markdown. */
const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

/** Collect the `align` attr of every cell in the first table's first row. */
function headerAligns(md: string): (string | null)[] {
  const doc = parseMarkdown(md)
  let row: ProseMirrorNode | null = null
  doc.descendants((node) => {
    if (row) return false
    if (node.type.name === 'table_row') {
      row = node
      return false
    }
    return true
  })
  if (!row) throw new Error('no table row found')
  const aligns: (string | null)[] = []
  ;(row as ProseMirrorNode).forEach((cell) => {
    aligns.push((cell.attrs['align'] as string | null) ?? null)
  })
  return aligns
}

describe('table column alignment - parsing', () => {
  it('reads left/right alignment from the separator row onto cells', () => {
    const md = '| L | R |\n|:--|--:|\n| a | b |'
    expect(headerAligns(md)).toEqual(['left', 'right'])
  })

  it('reads center alignment', () => {
    const md = '| L | C | R |\n|:--|:-:|--:|\n| a | b | c |'
    expect(headerAligns(md)).toEqual(['left', 'center', 'right'])
  })

  it('leaves unaligned columns with a null align', () => {
    const md = '| H1 | H2 |\n| --- | --- |\n| a | b |'
    expect(headerAligns(md)).toEqual([null, null])
  })

  it('applies the column alignment to body cells too', () => {
    const doc = parseMarkdown('| L | R |\n|:--|--:|\n| a | b |')
    const bodyAligns: (string | null)[] = []
    let rowCount = 0
    doc.descendants((node) => {
      if (node.type.name === 'table_row') {
        rowCount += 1
        if (rowCount === 2) {
          node.forEach((cell) =>
            bodyAligns.push((cell.attrs['align'] as string | null) ?? null),
          )
        }
      }
      return true
    })
    expect(bodyAligns).toEqual(['left', 'right'])
  })
})

describe('table column alignment - serialization & round-trip', () => {
  it('serializes left/center/right markers in canonical padded form', () => {
    // Authored compact; the serializer emits the codebase's canonical padded
    // separator (`| :-- |`, matching the `| --- |` of plain tables).
    const compact = '| L | C | R |\n|:--|:-:|--:|\n| a | b | c |'
    const canonical = '| L | C | R |\n| :-- | :-: | --: |\n| a | b | c |'
    expect(rt(compact)).toBe(canonical)
    // True fixed point: the canonical form re-serializes to itself.
    expect(rt(canonical)).toBe(canonical)
  })

  it('round-trips left + right only', () => {
    const md = '| L | R |\n| :-- | --: |\n| a | b |'
    expect(rt(md)).toBe(md)
  })

  it('keeps plain (unaligned) tables using `---`', () => {
    const md = '| H1 | H2 |\n| --- | --- |\n| a | b |'
    expect(rt(md)).toBe(md)
  })

  it('round-trips a mix of aligned and unaligned columns', () => {
    const md = '| A | B | C |\n| --- | :-: | --: |\n| a | b | c |'
    expect(rt(md)).toBe(md)
    expect(rt(rt(md))).toBe(md)
  })
})
