/**
 * Tests for the recomputeDerived logic used in App.tsx.
 *
 * recomputeDerived(markdown) is the helper that App.tsx uses on mount (to
 * seed counts/outline from the initial welcome document) and in the debounced
 * onChange handler (subsequent edits). The helper itself is not exported, but
 * its logic is a thin composition of parseMarkdown + getOutline + countWords,
 * all of which ARE exported. We test that composition here so we can assert:
 *
 *   1. The welcome markdown produces non-zero word/char counts.
 *   2. The welcome markdown produces a non-empty outline (has headings).
 *
 * This validates that the mount effect in App.tsx will correctly populate the
 * store status bar on initial load (Bug 1 fix).
 */
import { describe, it, expect } from 'vitest'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { getOutline } from '../../../src/renderer/editor/outline'
import { countWords } from '../../../src/renderer/editor/wordCount'

// ---------------------------------------------------------------------------
// The same WELCOME_MARKDOWN constant used in App.tsx.
// Keep in sync manually; a type-level test is impractical without exporting it.
// ---------------------------------------------------------------------------
const WELCOME_MARKDOWN = `# Welcome to Lekha

Lekha is a WYSIWYG-style WYSIWYG Markdown editor.

## Getting started

- Open a file with **File > Open** or press \`Cmd+O\`
- Open a folder with **File > Open Folder** to browse your notes
- Toggle between **WYSIWYG** and **Source** view at any time

## Editing

Start typing to edit this document. Your changes are tracked automatically.

> Lekha renders Markdown as you write - no preview step needed.
`

describe('recomputeDerived logic (Bug 1: initial load counts)', () => {
  it('produces non-zero word count for the welcome document', () => {
    const doc = parseMarkdown(WELCOME_MARKDOWN)
    const { words } = countWords(doc)
    expect(words).toBeGreaterThan(0)
  })

  it('produces non-zero char count for the welcome document', () => {
    const doc = parseMarkdown(WELCOME_MARKDOWN)
    const { chars } = countWords(doc)
    expect(chars).toBeGreaterThan(0)
  })

  it('produces a non-empty outline (headings) for the welcome document', () => {
    const doc = parseMarkdown(WELCOME_MARKDOWN)
    const outline = getOutline(doc)
    expect(outline.length).toBeGreaterThan(0)
  })

  it('extracts the h1 "Welcome to Lekha" as the first outline item', () => {
    const doc = parseMarkdown(WELCOME_MARKDOWN)
    const outline = getOutline(doc)
    expect(outline[0]).toMatchObject({ level: 1, text: 'Welcome to Lekha' })
  })

  it('word count is above 30 (welcome doc has substantial text)', () => {
    const doc = parseMarkdown(WELCOME_MARKDOWN)
    const { words } = countWords(doc)
    // The welcome document has at least 30 words; this guards against trivial
    // empty-parse regressions while not being brittle to minor text changes.
    expect(words).toBeGreaterThan(30)
  })
})
