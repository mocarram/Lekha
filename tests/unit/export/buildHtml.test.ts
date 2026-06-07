// @vitest-environment jsdom
/**
 * Unit tests for buildExportHtml - the pure renderer-side HTML export builder.
 *
 * Runs in jsdom (overriding the default happy-dom env for this file) so that
 * DOMPurify - which buildHtml now uses to sanitize the rendered body - parses
 * HTML the same way real Chromium does. happy-dom's HTML parser drops the
 * first/outer block element when DOMPurify reparses a fragment (e.g. <h1>x</h1>
 * collapses to "x"), which is a happy-dom quirk not present in the real
 * renderer; jsdom matches Chromium's parsing so the sanitizer output is
 * faithful. Mermaid is mocked to avoid requiring a real browser layout engine;
 * the mock returns a predictable SVG string so we can assert the mermaid code
 * block is converted to an SVG container.
 */

// Mock mermaid BEFORE importing buildExportHtml so the module sees the mock.
import { vi, describe, it, expect } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg id="mock">diagram</svg>' }),
  },
}))

import { buildExportHtml } from '../../../src/renderer/export/buildHtml'

// ---------------------------------------------------------------------------
// Document structure
// ---------------------------------------------------------------------------

describe('buildExportHtml - document structure', () => {
  it('returns a string starting with <!DOCTYPE html>', async () => {
    const html = await buildExportHtml('# Hello')
    expect(html).toMatch(/^<!DOCTYPE html>/i)
  })

  it('contains a <head> with charset meta', async () => {
    const html = await buildExportHtml('text')
    expect(html).toContain('<meta charset="utf-8"')
  })

  it('uses the provided title in <title>', async () => {
    const html = await buildExportHtml('# Doc', { title: 'My Export' })
    expect(html).toContain('<title>My Export</title>')
  })

  it('falls back to "Untitled" when no title is given', async () => {
    const html = await buildExportHtml('text')
    expect(html).toContain('<title>Untitled</title>')
  })

  it('inlines a <style> block (CSS is not a link)', async () => {
    const html = await buildExportHtml('text')
    expect(html).toContain('<style>')
    expect(html).not.toMatch(/<link[^>]+stylesheet/i)
  })

  it('wraps content in a .markdown-body container', async () => {
    const html = await buildExportHtml('# Hi\n\nHello')
    expect(html).toContain('class="markdown-body"')
  })
})

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

describe('buildExportHtml - markdown rendering', () => {
  it('renders heading 1 as <h1>', async () => {
    const html = await buildExportHtml('# Title\n\ntext')
    expect(html).toContain('<h1>Title</h1>')
  })

  it('renders bold as <strong>', async () => {
    const html = await buildExportHtml('**bold text**')
    expect(html).toContain('<strong>bold text</strong>')
  })

  it('renders italic as <em>', async () => {
    const html = await buildExportHtml('_italic_')
    expect(html).toContain('<em>italic</em>')
  })

  it('renders strikethrough as <s>', async () => {
    const html = await buildExportHtml('~~strike~~')
    expect(html).toContain('<s>strike</s>')
  })

  it('renders unordered list as <ul><li>', async () => {
    const html = await buildExportHtml('- item one\n- item two')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>')
    expect(html).toContain('item one')
  })

  it('renders a GFM table as <table>', async () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |'
    const html = await buildExportHtml(md)
    expect(html).toContain('<table>')
    expect(html).toContain('<th>')
  })

  it('renders a task list with checkboxes', async () => {
    const md = '- [x] done\n- [ ] todo'
    const html = await buildExportHtml(md)
    expect(html).toContain('checked')
    expect(html).toContain('todo')
  })
})

// ---------------------------------------------------------------------------
// Code highlighting
// ---------------------------------------------------------------------------

describe('buildExportHtml - code highlighting', () => {
  it('renders a ```js code block with hljs CSS classes', async () => {
    const md = '```js\nconst x = 1\n```'
    const html = await buildExportHtml(md)
    // highlight.js emits spans with class="hljs-..." or a wrapper with class="hljs"
    expect(html).toMatch(/hljs/)
  })

  it('renders plain fenced code (no language) without crashing', async () => {
    const md = '```\nplain code\n```'
    const html = await buildExportHtml(md)
    expect(html).toContain('plain code')
  })
})

// ---------------------------------------------------------------------------
// Math rendering (KaTeX)
// ---------------------------------------------------------------------------

describe('buildExportHtml - math rendering', () => {
  it('renders inline math $x^2$ to KaTeX HTML (contains katex class)', async () => {
    const html = await buildExportHtml('Inline $x^2$ math')
    expect(html).toMatch(/katex/)
  })

  it('renders block math $$...$$ to KaTeX HTML (display mode)', async () => {
    const md = '$$\n\\int_0^1 x\\,dx\n$$'
    const html = await buildExportHtml(md)
    expect(html).toMatch(/katex/)
  })

  it('does not contain raw $...$ delimiters (math is rendered)', async () => {
    const html = await buildExportHtml('Value $E=mc^2$ here')
    // The KaTeX output replaces the $...$; no literal "$E=mc^2$" in output
    expect(html).not.toContain('$E=mc^2$')
  })
})

// ---------------------------------------------------------------------------
// Mermaid diagrams
// ---------------------------------------------------------------------------

describe('buildExportHtml - mermaid rendering', () => {
  it('converts a ```mermaid block to an SVG container', async () => {
    const md = '```mermaid\ngraph TD; A-->B;\n```'
    const html = await buildExportHtml(md)
    // The mock returns '<svg id="mock">diagram</svg>'
    expect(html).toContain('<svg')
  })

  it('does not leave raw mermaid source in a <code> block', async () => {
    const md = '```mermaid\ngraph TD; A-->B;\n```'
    const html = await buildExportHtml(md)
    // The mermaid source should not appear verbatim inside a <code> tag
    expect(html).not.toMatch(/<code[^>]*>[\s\S]*graph TD/)
  })
})

// ---------------------------------------------------------------------------
// HTML sanitization (DOMPurify) - inline HTML from an opened (untrusted) .md
// must be stripped of script / event handlers / iframes WITHOUT breaking the
// legitimately-rendered markdown / math / mermaid / code output.
// ---------------------------------------------------------------------------

describe('buildExportHtml - sanitization strips dangerous markup', () => {
  it('strips a raw <script> tag from inline HTML', async () => {
    const html = await buildExportHtml('<script>alert(1)</script>\n\n# Hi')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).not.toMatch(/<script\b/i)
    // The legitimate markdown still renders.
    expect(html).toContain('<h1>Hi</h1>')
  })

  it('strips inline event-handler attributes (onerror) from <img>', async () => {
    const html = await buildExportHtml('<img src=x onerror=alert(1)>')
    expect(html).not.toMatch(/onerror/i)
    // The img element itself may survive (sanitized), but with no handler.
    expect(html).not.toContain('alert(1)')
  })

  it('strips <iframe> and <object> elements', async () => {
    const html = await buildExportHtml(
      '<iframe src="https://evil.test"></iframe>\n\n<object data="x"></object>\n\n# Ok',
    )
    expect(html).not.toMatch(/<iframe\b/i)
    expect(html).not.toMatch(/<object\b/i)
    expect(html).toContain('<h1>Ok</h1>')
  })

  it('removes javascript: URLs from link hrefs', async () => {
    // markdown-it itself refuses a javascript: link (leaves it as literal text);
    // an inline-HTML <a> is the real attack surface, so assert the sanitizer
    // drops the href there. No executable javascript: ends up in an attribute.
    const html = await buildExportHtml('<a href="javascript:alert(1)">click</a>')
    expect(html).not.toMatch(/href\s*=\s*["']?javascript:/i)
    // The anchor text survives but with no dangerous href.
    expect(html).toContain('click')
  })

  it('KEEPS rendered code / math / mermaid after sanitization', async () => {
    const md = [
      '<script>alert(1)</script>',
      '',
      '# Survivor',
      '',
      '```js',
      'const x = 1',
      '```',
      '',
      'Inline $x^2$ math.',
      '',
      '```mermaid',
      'graph TD; A-->B;',
      '```',
    ].join('\n')
    const html = await buildExportHtml(md)
    // Dangerous markup gone...
    expect(html).not.toMatch(/<script\b/i)
    // ...but every rendered feature survives.
    expect(html).toContain('<h1>Survivor</h1>')
    expect(html).toMatch(/hljs/) // code highlighting
    expect(html).toMatch(/katex/) // KaTeX math
    expect(html).toContain('<svg') // mermaid diagram SVG
  })
})

describe('buildExportHtml - includeCss option', () => {
  // NOTE: in vitest the `?raw` CSS imports resolve to empty strings, so the
  // styled/unstyled byte difference isn't observable here (it is in prod). We
  // assert structural validity + that no theme tokens leak with includeCss:false.
  it('still produces a valid document with includeCss:false', async () => {
    const bare = await buildExportHtml('# Hi', { includeCss: false })
    expect(bare).toContain('<!DOCTYPE html>')
    expect(bare).toContain('markdown-body')
    expect(bare).not.toContain('--gh-bg')
  })

  it('defaults to including CSS (valid doc, no error)', async () => {
    const html = await buildExportHtml('# Hi')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('markdown-body')
  })
})
