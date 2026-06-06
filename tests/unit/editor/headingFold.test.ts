/**
 * Unit tests for the headingFoldPlugin.
 *
 * The plugin folds a heading's SECTION (the blocks after the heading up to,
 * but not including, the next heading of the same-or-higher level) by adding
 * `folded-block` node decorations. Folding is VIEW-only: the document and its
 * serialized markdown are never altered.
 *
 * Tests:
 *   - sectionRange computes the hidden block range for H1/H2 nesting + EOF.
 *   - toggling a heading via meta marks its section blocks as folded.
 *   - serializing a doc with a folded heading yields the FULL markdown.
 */
import { describe, it, expect } from 'vitest'
import { EditorState } from 'prosemirror-state'
import {
  headingFoldPlugin,
  headingFoldKey,
  sectionRange,
  toggleFoldMeta,
} from '../../../src/renderer/editor/plugins/headingFold'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import type { Node } from 'prosemirror-model'

function makeState(markdown: string): EditorState {
  return EditorState.create({
    doc: parseMarkdown(markdown),
    plugins: [headingFoldPlugin()],
  })
}

/** Return the document position of the Nth heading (0-based). */
function headingPos(doc: Node, index: number): number {
  let count = 0
  let found = -1
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      if (count === index) found = pos
      count++
    }
    return found === -1
  })
  return found
}

/** Collect all decoration `from..to` ranges flagged with `folded-block`. */
function foldedRanges(state: EditorState): Array<{ from: number; to: number }> {
  const decoSet = headingFoldKey.getState(state)!.decorations
  const out: Array<{ from: number; to: number }> = []
  decoSet.find(0, state.doc.content.size).forEach((d) => {
    const attrs = (d as unknown as { type: { attrs?: Record<string, string> } }).type.attrs
    if (attrs && attrs['class'] && attrs['class'].includes('folded-block')) {
      out.push({ from: d.from, to: d.to })
    }
  })
  return out
}

describe('sectionRange', () => {
  it('spans the blocks after an H1 up to the next H1', () => {
    const md = '# One\n\nAlpha\n\nBeta\n\n# Two\n\nGamma'
    const doc = parseMarkdown(md)
    const h1 = headingPos(doc, 0)
    const { from, to } = sectionRange(doc, h1)
    // from = end of the heading node; to = start of the next H1.
    const headingNode = doc.nodeAt(h1)!
    expect(from).toBe(h1 + headingNode.nodeSize)
    const nextH1 = headingPos(doc, 1)
    expect(to).toBe(nextH1)
    // The hidden range must contain Alpha and Beta but not the second heading.
    expect(to).toBeGreaterThan(from)
  })

  it('includes a deeper H2 subsection inside an H1 section', () => {
    const md = '# Top\n\nIntro\n\n## Sub\n\nDetail\n\n# Next'
    const doc = parseMarkdown(md)
    const h1 = headingPos(doc, 0)
    const { to } = sectionRange(doc, h1)
    // Folding the H1 hides the H2 and its content too, so `to` is the next H1
    // ('Next'), which is the THIRD heading (index 2): Top, Sub, Next.
    expect(to).toBe(headingPos(doc, 2))
  })

  it('stops an H2 section at the next same-level H2', () => {
    const md = '# Top\n\n## A\n\nDetail A\n\n## B\n\nDetail B'
    const doc = parseMarkdown(md)
    const h2a = headingPos(doc, 1)
    const { from, to } = sectionRange(doc, h2a)
    expect(from).toBe(h2a + doc.nodeAt(h2a)!.nodeSize)
    expect(to).toBe(headingPos(doc, 2))
  })

  it('stops an H2 section at a higher-level H1', () => {
    const md = '# Top\n\n## Sub\n\nDetail\n\n# Other'
    const doc = parseMarkdown(md)
    const h2 = headingPos(doc, 1)
    const { to } = sectionRange(doc, h2)
    expect(to).toBe(headingPos(doc, 2)) // the H1 'Other'
  })

  it('runs to end of document when no following heading qualifies', () => {
    const md = '# Top\n\nAlpha\n\nBeta'
    const doc = parseMarkdown(md)
    const h1 = headingPos(doc, 0)
    const { to } = sectionRange(doc, h1)
    expect(to).toBe(doc.content.size)
  })

  it('returns an empty range for a heading with no following content', () => {
    const md = 'Intro\n\n# Last'
    const doc = parseMarkdown(md)
    const h1 = headingPos(doc, 0)
    const { from, to } = sectionRange(doc, h1)
    expect(from).toBe(to)
  })
})

describe('headingFoldPlugin decorations', () => {
  it('starts with no folded blocks', () => {
    const state = makeState('# One\n\nAlpha\n\n# Two\n\nBeta')
    expect(foldedRanges(state)).toHaveLength(0)
  })

  it('marks a section as folded after toggling the heading via meta', () => {
    const md = '# One\n\nAlpha\n\nBeta\n\n# Two\n\nGamma'
    const state = makeState(md)
    const h1 = headingPos(state.doc, 0)
    const folded = state.apply(state.tr.setMeta(headingFoldKey, toggleFoldMeta(h1)))

    const ranges = foldedRanges(folded)
    expect(ranges.length).toBeGreaterThan(0)
    // Every folded block must lie within the heading's section range.
    const sec = sectionRange(folded.doc, h1)
    for (const r of ranges) {
      expect(r.from).toBeGreaterThanOrEqual(sec.from)
      expect(r.to).toBeLessThanOrEqual(sec.to)
    }
  })

  it('toggling the same heading twice unfolds it', () => {
    const md = '# One\n\nAlpha\n\n# Two'
    const state = makeState(md)
    const h1 = headingPos(state.doc, 0)
    const once = state.apply(state.tr.setMeta(headingFoldKey, toggleFoldMeta(h1)))
    expect(foldedRanges(once).length).toBeGreaterThan(0)
    const twice = once.apply(once.tr.setMeta(headingFoldKey, toggleFoldMeta(h1)))
    expect(foldedRanges(twice)).toHaveLength(0)
  })

  it('maps fold positions through document edits so they do not go stale', () => {
    const md = '# One\n\nAlpha\n\n# Two\n\nBeta'
    const state = makeState(md)
    const h2 = headingPos(state.doc, 1)
    const folded = state.apply(state.tr.setMeta(headingFoldKey, toggleFoldMeta(h2)))
    const before = foldedRanges(folded)
    expect(before.length).toBeGreaterThan(0)

    // Insert text at the very start of the doc: the folded heading (and its
    // section) shift right by the inserted length. The plugin must remap.
    const edited = folded.apply(folded.tr.insertText('X', 1))
    const after = foldedRanges(edited)
    expect(after.length).toBe(before.length)
    // Folded ranges shifted by +1 (one char inserted before them).
    expect(after[0]!.from).toBe(before[0]!.from + 1)
  })

  it('drops a fold when the folded heading is deleted', () => {
    // Fold a heading, then delete that heading node entirely. The plugin must
    // drop the stale fold entry because the heading no longer exists in the doc.
    const md = '# One\n\nAlpha\n\n# Two\n\nBeta'
    const state = makeState(md)
    const h1 = headingPos(state.doc, 0)

    // Fold the first heading.
    const folded = state.apply(state.tr.setMeta(headingFoldKey, toggleFoldMeta(h1)))
    expect(foldedRanges(folded).length).toBeGreaterThan(0)

    // Delete the first heading node from the document.
    const headingNode = folded.doc.nodeAt(h1)!
    const deleteEnd = h1 + headingNode.nodeSize
    const afterDelete = folded.apply(folded.tr.delete(h1, deleteEnd))

    // The fold for the now-deleted heading must be gone.
    expect(foldedRanges(afterDelete)).toHaveLength(0)
    // Confirm the plugin state's folded set is also empty.
    expect(headingFoldKey.getState(afterDelete)!.folded.size).toBe(0)
  })

  it('serializing a doc with a folded heading still yields the FULL markdown (visual-only)', () => {
    const md = '# One\n\nAlpha\n\nBeta\n\n# Two\n\nGamma'
    const state = makeState(md)
    const h1 = headingPos(state.doc, 0)
    const folded = state.apply(state.tr.setMeta(headingFoldKey, toggleFoldMeta(h1)))

    // The document is unchanged by folding, so the markdown is identical.
    const out = serializeMarkdown(folded.doc)
    expect(out).toContain('Alpha')
    expect(out).toContain('Beta')
    expect(out).toContain('Gamma')
    expect(out.trim()).toBe(serializeMarkdown(state.doc).trim())
  })
})
