import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

/** Round-trip: markdown -> doc -> markdown. */
const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

describe('serializeMarkdown', () => {
  it('serializes an ATX heading', () => {
    expect(rt('# Hello')).toBe('# Hello')
  })

  it('serializes strong and em', () => {
    expect(rt('a **b** *c*')).toBe('a **b** *c*')
  })

  it('serializes strikethrough', () => {
    expect(rt('~~x~~')).toBe('~~x~~')
  })

  it('serializes a fenced code block with language', () => {
    expect(rt('```js\nconst x = 1\n```')).toBe('```js\nconst x = 1\n```')
  })

  it('serializes a task list', () => {
    expect(rt('- [x] a\n- [ ] b')).toBe('- [x] a\n- [ ] b')
  })

  it('serializes a bullet list', () => {
    expect(rt('- one\n- two')).toBe('- one\n- two')
  })

  it('serializes an ordered list', () => {
    expect(rt('1. one\n2. two')).toBe('1. one\n2. two')
  })

  it('serializes a blockquote', () => {
    expect(rt('> quoted')).toBe('> quoted')
  })

  it('serializes a GFM table', () => {
    const md = '| H1 | H2 |\n| --- | --- |\n| a | b |'
    expect(rt(md)).toBe('| H1 | H2 |\n| --- | --- |\n| a | b |')
  })
})

// KNOWN FIX #1: a `<ul>` that mixes plain bullet items with checkbox items is
// merged by markdown-it into one `task_list` carrying both `list_item`s and
// `task_item`s. The serializer must render BOTH child types and lose nothing.
describe('serializeMarkdown - mixed lists (KNOWN FIX #1)', () => {
  it('loses nothing for bullets followed by tasks', () => {
    // Authored with a blank line; markdown-it merges into one list, and the
    // canonical (contiguous) form is what we serialize back to.
    expect(rt('- one\n- two\n\n- [x] done\n- [ ] todo')).toBe(
      '- one\n- two\n- [x] done\n- [ ] todo',
    )
  })

  it('loses nothing for tasks followed by bullets (reverse order)', () => {
    expect(rt('- [x] done\n- [ ] todo\n\n- one\n- two')).toBe(
      '- [x] done\n- [ ] todo\n- one\n- two',
    )
  })

  it('loses nothing for contiguous bullet + task', () => {
    expect(rt('- a\n- [x] b')).toBe('- a\n- [x] b')
  })
})
