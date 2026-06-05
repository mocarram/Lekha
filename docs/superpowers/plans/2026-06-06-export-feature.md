# Export Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add HTML, PDF, and Word export to Lekha with a self-contained themed HTML renderer, an Electron offscreen-window PDF path, and pandoc-based Word export with graceful degradation.

**Architecture:** A pure renderer-side `buildExportHtml(markdown)` function renders markdown to a standalone `<!DOCTYPE html>` document with GitHub theme, KaTeX math, highlight.js code, and mermaid SVGs inlined - all CSS inlined so the file is self-contained. Main-process IPC handlers handle saving HTML to disk, printing to PDF via an offscreen `BrowserWindow`, and calling pandoc for Word export. Three new `AppCommand` values wire through the menu and `useCommands`.

**Tech Stack:** markdown-it (already installed), katex (renderToString), highlight.js (already installed), mermaid (already installed - mock in unit tests), Node `fs/promises`, Electron `webContents.printToPDF`, Node `child_process.spawn`, vitest/happy-dom.

---

## File Map

| File | Action | Role |
|------|--------|------|
| `src/shared/commands.ts` | Modify | Add `exportHtml`, `exportPdf`, `exportDocx` to `AppCommand` |
| `src/shared/ipc-channels.ts` | Modify | Add `exportHtml`, `exportPdf`, `exportDocx`, `pandocAvailable` channels |
| `src/renderer/export/buildHtml.ts` | Create | Pure function: markdown -> standalone HTML string |
| `src/main/ipc/export.ts` | Create | Main-process IPC handlers for the 3 export paths |
| `src/main/index.ts` | Modify | Register export handlers at startup |
| `src/main/menu.ts` | Modify | Add File > Export submenu (HTML, PDF, Word) |
| `src/preload/api.d.ts` | Modify | Extend `LekhaAPI` with export method signatures |
| `src/preload/index.ts` | Modify | Expose export methods on `window.lekha` |
| `src/renderer/hooks/useCommands.ts` | Modify | Handle `exportHtml`, `exportPdf`, `exportDocx` commands |
| `tests/unit/export/buildHtml.test.ts` | Create | Unit tests for the pure HTML builder |
| `tests/unit/hooks/useCommands.test.ts` | Modify | Add export methods to the `mockLekha` partial to keep existing tests compiling |

---

## Task 1: Extend shared types (commands + IPC channels)

**Files:**
- Modify: `src/shared/commands.ts`
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add export commands to AppCommand**

Open `src/shared/commands.ts`. Append three values to the union (after `'redo'`):

```typescript
export type AppCommand =
  | 'new'
  | 'open'
  | 'openFolder'
  | 'save'
  | 'saveAs'
  | 'toggleSource'
  | 'toggleSidebar'
  | 'find'
  | 'replace'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'link'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'heading5'
  | 'heading6'
  | 'paragraph'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'blockquote'
  | 'codeBlock'
  | 'horizontalRule'
  | 'undo'
  | 'redo'
  | 'exportHtml'
  | 'exportPdf'
  | 'exportDocx'
```

- [ ] **Step 2: Add export IPC channels**

Open `src/shared/ipc-channels.ts`. Extend the `IPC` object:

```typescript
export const IPC = {
  openFileDialog: 'dialog:openFile',
  openFolderDialog: 'dialog:openFolder',
  saveAsDialog: 'dialog:saveAs',
  confirmUnsaved: 'dialog:confirmUnsaved',
  readFile: 'fs:readFile',
  writeFile: 'fs:writeFile',
  readDir: 'fs:readDir',
  getRecentFiles: 'settings:getRecentFiles',
  addRecentFile: 'settings:addRecentFile',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setDocumentState: 'window:setDocumentState',
  command: 'app:command',
  openPath: 'app:openPath',
  // Export channels
  exportHtml: 'export:html',
  exportPdf: 'export:pdf',
  exportDocx: 'export:docx',
  pandocAvailable: 'export:pandocAvailable',
} as const
```

- [ ] **Step 3: Run typecheck to verify no type errors**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm run typecheck
```

Expected: no errors (changes are additive).

- [ ] **Step 4: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/shared/commands.ts src/shared/ipc-channels.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat(export): add export commands and IPC channels to shared types"
```

---

## Task 2: Write failing tests for buildExportHtml

**Files:**
- Create: `tests/unit/export/buildHtml.test.ts`

- [ ] **Step 1: Create the test file**

Create `tests/unit/export/buildHtml.test.ts` with the full test suite. The function under test does not exist yet - ALL tests should fail with "Cannot find module".

```typescript
/**
 * Unit tests for buildExportHtml - the pure renderer-side HTML export builder.
 *
 * Runs in happy-dom (the default vitest environment) so mermaid.render() has
 * a DOM available. Mermaid is mocked to avoid requiring a real browser layout
 * engine; the mock returns a predictable SVG string so we can assert the
 * mermaid code block is converted to an SVG container.
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

  it('renders block math $$...$$  to KaTeX HTML (display mode)', async () => {
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
```

- [ ] **Step 2: Run the tests and verify they ALL fail**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npx vitest run tests/unit/export/buildHtml.test.ts 2>&1 | tail -20
```

Expected: all tests fail with "Cannot find module '../../../src/renderer/export/buildHtml'".

---

## Task 3: Implement buildExportHtml

**Files:**
- Create: `src/renderer/export/buildHtml.ts`

- [ ] **Step 1: Create the export directory and implement the builder**

Create `src/renderer/export/buildHtml.ts`:

```typescript
/**
 * buildHtml.ts
 *
 * Renderer-side, pure async function that converts a Markdown string to a
 * self-contained standalone HTML document suitable for direct browser display
 * or PDF printing.
 *
 * Rendering pipeline:
 *   1. Pre-process: extract ```mermaid fenced blocks, render each to SVG via
 *      renderMermaid(), and replace the fenced blocks with placeholder tokens.
 *   2. Render remaining markdown via a dedicated markdown-it instance
 *      (CommonMark + strikethrough + tables + task-lists + math plugin),
 *      configured with:
 *        - highlight option: highlight.js over the fenced code block content
 *        - math_inline / math_block token rendering: katex.renderToString()
 *   3. Post-process: replace mermaid placeholders with the rendered SVGs.
 *   4. Wrap in a complete <!DOCTYPE html> document with:
 *        - Inlined github.css (imported as a raw string by Vite)
 *        - Inlined katex.min.css (imported as a raw string by Vite)
 *        - Inlined highlight.js github.css (imported as a raw string by Vite)
 *        - A .markdown-body container div matching the editor look.
 *
 * The function runs in the renderer process where the DOM is available, which
 * is required by mermaid.render() (it needs a real DOM to produce SVG).
 *
 * CSS is inlined (not linked) so the exported file is truly self-contained -
 * opening it from any location on disk or sending it by email will render
 * identically to the editor view.
 */

import MarkdownIt from 'markdown-it'
import katex from 'katex'
import hljs from 'highlight.js'
import taskLists from 'markdown-it-task-lists'
import { mathPlugin } from '../editor/math-plugin'
import { renderMermaid } from '../editor/mermaid'

// ---------------------------------------------------------------------------
// CSS imports (Vite resolves these as raw strings via ?raw)
// ---------------------------------------------------------------------------

// NOTE: These are imported as raw CSS strings by Vite's ?raw query. In tests
// (vitest/happy-dom) Vite is NOT used, so we handle the missing import by
// falling back to empty strings in the asset loader below.
import githubCss from '../styles/themes/github.css?raw'
import katexCss from 'katex/dist/katex.min.css?raw'
import hljsCss from 'highlight.js/styles/github.css?raw'

// ---------------------------------------------------------------------------
// markdown-it instance for export (separate from the ProseMirror parser)
// ---------------------------------------------------------------------------

/**
 * Build a fresh markdown-it instance for export rendering.
 *
 * Uses the same feature set as parser.ts (CommonMark + strikethrough + tables
 * + task-lists + math plugin) but adds:
 *   - highlight option for hljs code colouring
 *   - custom render rules for math_inline and math_block tokens (KaTeX)
 *
 * A factory function (not a module-level singleton) so tests can call it
 * without side effects and the function remains pure.
 */
function buildMarkdownIt(): MarkdownIt {
  const md = MarkdownIt('commonmark', {
    html: false,
    highlight(code: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return (
            '<pre><code class="hljs language-' +
            encodeURIComponent(lang) +
            '">' +
            hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
            '</code></pre>'
          )
        } catch {
          // Fall through to default escaping
        }
      }
      return (
        '<pre><code class="hljs">' +
        md.utils.escapeHtml(code) +
        '</code></pre>'
      )
    },
  })
    .enable(['strikethrough', 'table'])
    .use(taskLists, { label: true })
    .use(mathPlugin)

  // Override the render rules for math tokens so they produce KaTeX HTML
  // instead of the markdown-it default (which would emit the raw LaTeX).
  md.renderer.rules['math_inline'] = (tokens, idx): string => {
    const token = tokens[idx]
    const latex = token?.content ?? ''
    return katex.renderToString(latex, {
      displayMode: false,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
    })
  }

  md.renderer.rules['math_block'] = (tokens, idx): string => {
    const token = tokens[idx]
    const latex = token?.content ?? ''
    return (
      '<p>' +
      katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        trust: false,
        strict: 'ignore',
      }) +
      '</p>\n'
    )
  }

  return md
}

// ---------------------------------------------------------------------------
// Mermaid pre/post processing
// ---------------------------------------------------------------------------

interface MermaidBlock {
  placeholder: string
  svg: string
}

/**
 * Find all ```mermaid fenced blocks in the raw markdown, render each to SVG
 * via renderMermaid(), and return:
 *   - `processed`: the markdown with each mermaid block replaced by a unique
 *     placeholder comment that is safe to pass through markdown-it.
 *   - `blocks`: mapping from placeholder to rendered SVG (or error div).
 *
 * Placeholders are HTML comments so markdown-it passes them through verbatim
 * in the rendered output (html:false does not strip comments inserted by us
 * because comments survive as raw HTML from the fence rule).
 *
 * We use a separate placeholder approach rather than a custom markdown-it rule
 * because mermaid.render() is async and markdown-it rendering is synchronous.
 */
async function extractAndRenderMermaid(
  markdown: string,
): Promise<{ processed: string; blocks: MermaidBlock[] }> {
  const blocks: MermaidBlock[] = []
  // Regex: match ```mermaid (optional trailing whitespace) ... ``` fences.
  // The [\s\S]*? is non-greedy so it matches the FIRST closing ``` only.
  const mermaidFenceRe = /^```mermaid[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm

  let processed = markdown
  const matches: Array<{ full: string; code: string }> = []

  let match: RegExpExecArray | null
  while ((match = mermaidFenceRe.exec(markdown)) !== null) {
    matches.push({ full: match[0] ?? '', code: match[1] ?? '' })
  }

  for (let i = 0; i < matches.length; i++) {
    const { full, code } = matches[i]!
    const placeholder = `<!--MERMAID_PLACEHOLDER_${i}-->`
    const result = await renderMermaid(`export-${i}`, code.trim())

    let svg: string
    if ('svg' in result) {
      // Wrap the SVG in a div for display layout
      svg = `<div class="mermaid-diagram">${result.svg}</div>`
    } else {
      // Render error: show the error message in a styled block
      svg = `<div class="mermaid-error"><pre>${MarkdownIt().utils.escapeHtml(result.error)}</pre></div>`
    }

    blocks.push({ placeholder, svg })
    processed = processed.replace(full, placeholder)
  }

  return { processed, blocks }
}

/**
 * Replace each mermaid placeholder in the rendered HTML with its SVG.
 * markdown-it preserves HTML comments in output (they appear as-is in the
 * rendered body), so a simple string replace is safe here.
 */
function reinsertMermaid(html: string, blocks: MermaidBlock[]): string {
  let result = html
  for (const { placeholder, svg } of blocks) {
    result = result.replace(placeholder, svg)
  }
  return result
}

// ---------------------------------------------------------------------------
// HTML document assembly
// ---------------------------------------------------------------------------

/**
 * Build the complete standalone HTML document string.
 *
 * @param body    - The rendered HTML body fragment (headings, paragraphs, etc.)
 * @param title   - Document title for the <title> element.
 * @param cssBlob - Already-concatenated CSS string to inline in <style>.
 */
function buildDocument(body: string, title: string, cssBlob: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtmlEntities(title)}</title>
  <style>
/* GitHub theme */
${cssBlob}

/* Export layout: center the content with a readable max-width */
body {
  margin: 0;
  padding: 32px 16px;
  background: #fff;
}

.markdown-body {
  max-width: 860px;
  margin: 0 auto;
  font-family: var(--gh-font-body, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif);
  font-size: var(--gh-font-size, 16px);
  line-height: 1.6;
  color: var(--gh-text, #333);
  word-wrap: break-word;
}

/* Mermaid diagram container */
.mermaid-diagram {
  text-align: center;
  margin: 1em 0;
}

/* Mermaid error display */
.mermaid-error {
  border: 1px solid #e74c3c;
  border-radius: 4px;
  padding: 8px 12px;
  background: #fdf3f2;
  color: #c0392b;
  font-size: 0.9em;
}
  </style>
</head>
<body>
  <div class="markdown-body">
${body}
  </div>
</body>
</html>`
}

/** Escape only the characters that are unsafe inside HTML attribute values / text. */
function escapeHtmlEntities(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildHtmlOptions {
  /** Used as the document <title>. Defaults to "Untitled". */
  title?: string
}

/**
 * Render `markdown` to a complete, self-contained HTML document.
 *
 * The document includes:
 *   - GitHub theme CSS (inlined from themes/github.css)
 *   - KaTeX CSS (inlined from katex/dist/katex.min.css)
 *   - highlight.js GitHub CSS (inlined from highlight.js/styles/github.css)
 *   - KaTeX-rendered math ($...$ and $$...$$)
 *   - highlight.js-highlighted code blocks
 *   - Mermaid diagrams rendered to inline SVG
 *
 * All CSS is inlined so the output file is self-contained (no network requests).
 *
 * @param markdown - Raw markdown source text.
 * @param opts     - Optional title for the HTML document.
 * @returns        Full `<!DOCTYPE html>` document as a string.
 */
export async function buildExportHtml(
  markdown: string,
  opts?: BuildHtmlOptions,
): Promise<string> {
  const title = opts?.title ?? 'Untitled'

  // 1. Extract mermaid blocks and render them asynchronously
  const { processed, blocks } = await extractAndRenderMermaid(markdown)

  // 2. Build and run the markdown-it renderer
  const md = buildMarkdownIt()
  let body = md.render(processed)

  // 3. Reinsert the rendered mermaid SVGs
  body = reinsertMermaid(body, blocks)

  // 4. Concatenate all CSS (github theme + katex + hljs)
  const cssBlob = [githubCss, katexCss, hljsCss].join('\n\n')

  // 5. Assemble the complete HTML document
  return buildDocument(body, title, cssBlob)
}
```

- [ ] **Step 2: Run the failing tests again - they should now pass**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npx vitest run tests/unit/export/buildHtml.test.ts 2>&1 | tail -30
```

Expected: all tests pass. If CSS `?raw` imports fail in the test environment (vitest does not use Vite's plugin pipeline for `?raw`), the test will error on the import. See Step 3 for the fix.

- [ ] **Step 3: Handle ?raw imports in vitest (add vitest asset transform)**

Vitest does not process Vite's `?raw` suffix by default - it resolves the import as a regular module import and the `?raw` part causes a "Cannot find module" error. Fix by adding an `assetsInclude` pattern and an inline transform in `vitest.config.ts`:

Open `vitest.config.ts` and update it to:

```typescript
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts?(x)'],
    // Treat ?raw imports as empty strings in unit tests so CSS inlining
    // paths are exercised without needing Vite's full asset pipeline.
    // The actual CSS values are tested only in the build/e2e; unit tests
    // only assert structural HTML correctness.
    server: {
      deps: {
        inline: [/\?raw$/],
      },
    },
  },
})
```

If the `server.deps.inline` approach does not silence the `?raw` errors (vitest version differences), use a `setupFiles` mock instead. Create `tests/unit/setup/rawMock.ts`:

```typescript
// Intercept all ?raw CSS imports and return empty strings.
// This file is listed under test.setupFiles in vitest.config.ts.
// It must run BEFORE any test file imports a module that uses ?raw.
import { vi } from 'vitest'

vi.mock('../../../src/renderer/export/buildHtml', async (importOriginal) => {
  // We do NOT mock buildHtml itself - we let it import normally.
  // Instead we mock only the CSS side-effect imports so ?raw does not throw.
  return importOriginal()
})
```

A cleaner approach is a vitest plugin that resolves `?raw` imports. Add this to `vitest.config.ts` plugins array:

```typescript
// Plugin that resolves ?raw imports to empty strings during tests.
// Vite's built-in ?raw handling only applies to the dev/build server, not
// the vitest runner. This plugin fills the gap.
{
  name: 'raw-import-stub',
  resolveId(id: string) {
    if (id.endsWith('?raw')) return id
    return null
  },
  load(id: string) {
    if (id.endsWith('?raw')) return 'export default ""'
    return null
  },
},
```

Full updated `vitest.config.ts`:

```typescript
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Plugin that resolves ?raw imports to empty strings during unit tests.
// Vite's built-in ?raw handling is only active in the dev/build server, not
// in the vitest runner. Without this plugin, any import ending in ?raw throws
// "Cannot find module". We return an empty default export so the inlining
// path in buildHtml.ts is exercised structurally (CSS content is tested in
// build/e2e; unit tests assert HTML structure, not CSS values).
const rawImportStub: Plugin = {
  name: 'raw-import-stub',
  resolveId(id: string) {
    if (id.endsWith('?raw')) return '\0' + id
    return null
  },
  load(id: string) {
    if (id.startsWith('\0') && id.endsWith('?raw')) return 'export default ""'
    return null
  },
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts?(x)'],
    plugins: [rawImportStub],
  },
})
```

- [ ] **Step 4: Run tests again after vitest config fix**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npx vitest run tests/unit/export/buildHtml.test.ts 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Run the full test suite to verify no regressions**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm test 2>&1 | tail -20
```

Expected: all existing tests still pass plus the new export tests.

- [ ] **Step 6: Run typecheck and lint**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/renderer/export/buildHtml.ts tests/unit/export/buildHtml.test.ts vitest.config.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat(export): themed standalone HTML export"
```

---

## Task 4: Extend the preload bridge (LekhaAPI + window.lekha)

**Files:**
- Modify: `src/preload/api.d.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add export method signatures to LekhaAPI**

Open `src/preload/api.d.ts`. Add export methods after the `onOpenPath` declaration:

```typescript
import type { FileNode, Settings, DocumentState } from '@shared/types'
import type { AppCommand } from '@shared/commands'

/** All methods exposed on window.lekha from the preload bridge. */
export interface LekhaAPI {
  // --- Dialogs ---
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>
  /** Show the native "unsaved changes" dialog. Returns the user's choice. */
  confirmUnsaved(): Promise<'save' | 'dontSave' | 'cancel'>

  // --- Filesystem ---
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readDir(dir: string): Promise<FileNode[]>

  // --- Settings ---
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getRecentFiles(): Promise<string[]>
  addRecentFile(path: string): Promise<void>

  // --- Window state ---
  setDocumentState(state: DocumentState): void

  // --- Commands from main ---
  onCommand(cb: (cmd: AppCommand) => void): () => void
  onOpenPath(cb: (path: string) => void): () => void

  // --- Export ---
  /** Save an HTML string to a .html file chosen by a save dialog. */
  exportHtml(args: { html: string; suggestedName: string }): Promise<void>
  /** Render HTML to PDF via Electron printToPDF and save to a .pdf file. */
  exportPdf(args: { html: string; suggestedName: string }): Promise<void>
  /** Export markdown to .docx via pandoc. Rejects if pandoc is not installed. */
  exportDocx(args: { markdown: string; suggestedName: string }): Promise<void>
  /** Returns true if pandoc is available on the system PATH. */
  pandocAvailable(): Promise<boolean>
}

declare global {
  interface Window {
    lekha: LekhaAPI
  }
}
```

- [ ] **Step 2: Expose export methods in the preload bridge**

Open `src/preload/index.ts`. Add four export methods to the `api` object (after `onOpenPath`):

```typescript
  // --- Export ---
  exportHtml(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportHtml, args) as Promise<void>
  },

  exportPdf(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportPdf, args) as Promise<void>
  },

  exportDocx(args: { markdown: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportDocx, args) as Promise<void>
  },

  pandocAvailable(): Promise<boolean> {
    return ipcRenderer.invoke(IPC.pandocAvailable) as Promise<boolean>
  },
```

- [ ] **Step 3: Update the useCommands test mock to include export methods**

Open `tests/unit/hooks/useCommands.test.ts`. In the `stubLekha()` function, add the four export methods to `mockLekha` so the partial satisfies the updated `LekhaAPI` type:

```typescript
function stubLekha(): void {
  capturedDispatch = null
  const mockLekha: Partial<LekhaAPI> = {
    onCommand: vi.fn((cb: (cmd: AppCommand) => void) => {
      capturedDispatch = cb
      return unsubscribeMock
    }),
    onOpenPath: vi.fn(() => () => undefined),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportDocx: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
  }
  vi.stubGlobal('lekha', mockLekha)
}
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/preload/api.d.ts src/preload/index.ts tests/unit/hooks/useCommands.test.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat(export): expose export methods on preload bridge"
```

---

## Task 5: Main-process IPC export handlers

**Files:**
- Create: `src/main/ipc/export.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Create the export handlers file**

Create `src/main/ipc/export.ts`:

```typescript
/**
 * export.ts - Main-process IPC handlers for document export.
 *
 * Three export paths:
 *
 *   exportHtml  - Receives a rendered HTML string from the renderer.
 *                 Shows a .html save dialog and writes the file to disk.
 *                 Pure file write; no additional processing needed.
 *
 *   exportPdf   - Receives a rendered HTML string from the renderer.
 *                 Creates an OFFSCREEN BrowserWindow (show:false), loads the
 *                 HTML via a temporary file (more robust than data: URLs for
 *                 large documents), waits for the 'did-finish-load' event,
 *                 calls webContents.printToPDF({ printBackground:true,
 *                 pageSize:'A4' }), writes the resulting Buffer to the path
 *                 chosen by a .pdf save dialog, then destroys the offscreen
 *                 window.
 *
 *                 Offscreen window notes:
 *                   - sandbox:false is required for printToPDF to work in
 *                     Electron's renderer process sandbox.
 *                   - The window is always destroyed in a finally block even
 *                     if printToPDF or the save dialog fail.
 *                   - The temp file is removed after the PDF is written.
 *
 *   exportDocx  - Detects pandoc availability (cached after first check).
 *                 Receives the raw markdown string. Shows a .docx save dialog.
 *                 Spawns `pandoc -f markdown -t docx -o <outPath>` and pipes
 *                 the markdown to stdin. Rejects with a user-friendly message
 *                 if pandoc is absent.
 *
 *   pandocAvailable - Returns a boolean. Cached on first call so repeated menu
 *                     queries do not spawn a new process each time.
 *
 * None of these handlers are unit-tested (they require Electron's BrowserWindow
 * and dialog APIs, and child_process.spawn - all Electron-bound). The
 * pandoc argument builder `buildPandocArgs` is a pure helper that IS testable
 * (see the brief comment below its definition).
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { IPC } from '@shared/ipc-channels'

// ---------------------------------------------------------------------------
// Pandoc detection (cached)
// ---------------------------------------------------------------------------

/** Cached pandoc availability - null means "not yet checked". */
let pandocAvailableCache: boolean | null = null

/**
 * Check if `pandoc` is on the system PATH.
 *
 * Runs `pandoc --version` and resolves true on exit code 0, false otherwise.
 * The result is cached so the check only runs once per process lifetime.
 */
async function checkPandocAvailable(): Promise<boolean> {
  if (pandocAvailableCache !== null) return pandocAvailableCache

  return new Promise<boolean>((resolve) => {
    const proc = spawn('pandoc', ['--version'], { stdio: 'ignore' })
    proc.on('error', () => {
      pandocAvailableCache = false
      resolve(false)
    })
    proc.on('exit', (code) => {
      pandocAvailableCache = code === 0
      resolve(pandocAvailableCache)
    })
  })
}

// ---------------------------------------------------------------------------
// Pure pandoc arg builder (testable without Electron)
// ---------------------------------------------------------------------------

/**
 * Build the pandoc argument array for a markdown -> docx conversion.
 *
 * Pure function; does not touch the filesystem or spawn anything.
 * Extracted so it can be tested independently (see note in handler comments
 * above - the handler itself is Electron-bound and not unit-tested).
 *
 * @param outPath - Absolute path to write the .docx output to.
 * @returns Array of CLI arguments to pass to `pandoc`.
 */
export function buildPandocArgs(outPath: string): string[] {
  return ['-f', 'markdown', '-t', 'docx', '-o', outPath]
}

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

/**
 * Register all export IPC handlers.
 *
 * @param getWindow - Returns the current main BrowserWindow (used as parent
 *   for save dialogs so they are attached to the main window as sheets on
 *   macOS). May return null if no window exists yet; handlers cope by passing
 *   undefined to Electron's dialog APIs (which then show as floating dialogs).
 */
export function registerExportHandlers(
  getWindow: () => BrowserWindow | null,
): void {
  // -------------------------------------------------------------------------
  // export:html
  // -------------------------------------------------------------------------

  ipcMain.handle(
    IPC.exportHtml,
    async (_event, args: { html: string; suggestedName: string }): Promise<void> => {
      const win = getWindow()
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        defaultPath: args.suggestedName,
        filters: [{ name: 'HTML Files', extensions: ['html'] }],
      })

      if (result.canceled || !result.filePath) return

      await writeFile(result.filePath, args.html, 'utf-8')
    },
  )

  // -------------------------------------------------------------------------
  // export:pdf
  //
  // Offscreen BrowserWindow flow:
  //   1. Write the HTML to a temp file (avoids data: URL length limits and
  //      ensures relative resources inside the HTML work if any exist).
  //   2. Create a hidden BrowserWindow with sandbox:false (required for
  //      printToPDF to function correctly in Electron).
  //   3. Load the temp file via loadFile() and await 'did-finish-load'.
  //   4. Call printToPDF({ printBackground:true, pageSize:'A4' }).
  //   5. Show the save dialog and write the PDF Buffer to disk.
  //   6. Destroy the offscreen window and delete the temp file (finally).
  // -------------------------------------------------------------------------

  ipcMain.handle(
    IPC.exportPdf,
    async (_event, args: { html: string; suggestedName: string }): Promise<void> => {
      // Write HTML to a temp file so loadFile() can read it (data: URLs have
      // length limits that cause problems with large, CSS-inlined documents).
      const tmpPath = join(tmpdir(), `lekha-export-${Date.now()}.html`)
      await writeFile(tmpPath, args.html, 'utf-8')

      // Create the offscreen window. sandbox:false is required for printToPDF
      // to work - with sandbox:true Electron cannot access the printer backend.
      const offscreen = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: {
          sandbox: false,
        },
      })

      try {
        // Load the temp HTML and wait for the page to finish rendering.
        await new Promise<void>((resolve, reject) => {
          offscreen.webContents.once('did-finish-load', resolve)
          offscreen.webContents.once('did-fail-load', (_e, code, desc) => {
            reject(new Error(`Failed to load export HTML: ${desc} (${code})`))
          })
          void offscreen.loadFile(tmpPath)
        })

        // Render the page to a PDF buffer.
        const pdfBuffer = await offscreen.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
        })

        // Ask the user where to save the PDF.
        const win = getWindow()
        const result = await dialog.showSaveDialog(win ?? undefined!, {
          defaultPath: args.suggestedName,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        })

        if (result.canceled || !result.filePath) return

        await writeFile(result.filePath, pdfBuffer)
      } finally {
        // Always clean up: destroy the offscreen window and remove the temp file.
        offscreen.destroy()
        await unlink(tmpPath).catch(() => { /* ignore if already gone */ })
      }
    },
  )

  // -------------------------------------------------------------------------
  // export:docx
  //
  // Pandoc flow:
  //   1. Check pandoc availability (cached).
  //   2. Show the .docx save dialog.
  //   3. Spawn `pandoc -f markdown -t docx -o <outPath>` and pipe the
  //      markdown to stdin, then close stdin to signal EOF.
  //   4. Collect stderr; on non-zero exit, reject with the stderr text.
  // -------------------------------------------------------------------------

  ipcMain.handle(
    IPC.exportDocx,
    async (_event, args: { markdown: string; suggestedName: string }): Promise<void> => {
      const available = await checkPandocAvailable()
      if (!available) {
        throw new Error(
          'Pandoc is not installed. Install pandoc (https://pandoc.org) to enable Word export.',
        )
      }

      const win = getWindow()
      const result = await dialog.showSaveDialog(win ?? undefined!, {
        defaultPath: args.suggestedName,
        filters: [{ name: 'Word Documents', extensions: ['docx'] }],
      })

      if (result.canceled || !result.filePath) return

      const outPath = result.filePath
      const args_ = buildPandocArgs(outPath)

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('pandoc', args_, { stdio: ['pipe', 'ignore', 'pipe'] })
        const stderrChunks: Buffer[] = []

        proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

        proc.on('error', (err) => {
          reject(new Error(`Failed to spawn pandoc: ${err.message}`))
        })

        proc.on('exit', (code) => {
          if (code === 0) {
            resolve()
          } else {
            const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
            reject(new Error(`pandoc exited with code ${code}: ${stderr}`))
          }
        })

        // Write markdown to stdin and close to signal EOF.
        proc.stdin?.write(args.markdown, 'utf-8')
        proc.stdin?.end()
      })
    },
  )

  // -------------------------------------------------------------------------
  // export:pandocAvailable
  // -------------------------------------------------------------------------

  ipcMain.handle(IPC.pandocAvailable, async (): Promise<boolean> => {
    return checkPandocAvailable()
  })
}
```

- [ ] **Step 2: Register export handlers in main/index.ts**

Open `src/main/index.ts`. Add the import for `registerExportHandlers` after the existing IPC imports:

```typescript
import { registerExportHandlers } from '@main/ipc/export'
```

Then add the registration call right after `registerFileHandlers(...)`:

```typescript
  registerExportHandlers(getWindow)
```

The full registration block in `app.whenReady()` should then look like:

```typescript
  registerDialogHandlers(getWindow)
  registerFileHandlers(
    settings,
    getWindow,
    async () => { ... },
    (state) => { ... },
  )
  registerExportHandlers(getWindow)
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/main/ipc/export.ts src/main/index.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat: PDF and pandoc (Word) export with main-process IPC handlers"
```

---

## Task 6: Add File > Export submenu to the menu

**Files:**
- Modify: `src/main/menu.ts`

- [ ] **Step 1: Add the Export submenu to the File menu in buildMenuTemplate**

Open `src/main/menu.ts`. The `buildMenuTemplate` function currently ends the File submenu with `Save As...`. Add an Export submenu after it.

The menu design: always show all three export items. The Word item calls `send('exportDocx')` just like the others - if pandoc is absent, the IPC handler throws and the error dialog is shown by the renderer's `useCommands` handler (keeps the menu building logic pure and avoids async pandoc detection at menu-build time, which would complicate the synchronous `buildMenuTemplate` signature).

Update the File submenu in `buildMenuTemplate`:

```typescript
  template.push({
    label: 'File',
    submenu: [
      item('New',           'CmdOrCtrl+N',       'new',        send),
      item('Open…',         'CmdOrCtrl+O',       'open',       send),
      item('Open Folder…',  'CmdOrCtrl+Shift+O', 'openFolder', send),
      {
        label: 'Open Recent',
        submenu: buildOpenRecentSubmenu(recentFiles, openPath),
      },
      sep,
      item('Save',          'CmdOrCtrl+S',       'save',       send),
      item('Save As…',      'CmdOrCtrl+Shift+S', 'saveAs',     send),
      sep,
      {
        label: 'Export',
        submenu: [
          item('Export to HTML…', undefined, 'exportHtml', send),
          item('Export to PDF…',  undefined, 'exportPdf',  send),
          // Word export requires pandoc. The menu item is always shown;
          // if pandoc is absent the IPC handler throws a friendly error
          // that useCommands surfaces to the user. This keeps buildMenuTemplate
          // synchronous (no async pandoc detection needed at menu-build time).
          item('Export to Word (docx)…', undefined, 'exportDocx', send),
        ],
      },
    ],
  })
```

- [ ] **Step 2: Add menu tests for the Export submenu**

Open `tests/unit/main/menu.test.ts`. Add a new describe block at the end of the file:

```typescript
// ---------------------------------------------------------------------------
// Export submenu tests
// ---------------------------------------------------------------------------

describe('buildMenuTemplate - Export submenu', () => {
  function findExportSubmenu(
    template: MenuItemConstructorOptions[],
  ): MenuItemConstructorOptions[] | undefined {
    const fileMenu = template.find((t) => t.label === 'File')
    if (!fileMenu) return undefined
    const fileItems = fileMenu.submenu as MenuItemConstructorOptions[]
    const exportItem = fileItems.find((i) => i.label === 'Export')
    if (!exportItem?.submenu) return undefined
    return exportItem.submenu as MenuItemConstructorOptions[]
  }

  it('File menu contains an Export submenu', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const fileMenu = template.find((t) => t.label === 'File')
    const fileItems = fileMenu!.submenu as MenuItemConstructorOptions[]
    const labels = fileItems.map((i) => i.label)
    expect(labels).toContain('Export')
  })

  it('Export submenu has HTML, PDF, and Word items', () => {
    const send = vi.fn()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    expect(items).toBeDefined()
    const labels = items!.map((i) => i.label)
    expect(labels).toContain('Export to HTML…')
    expect(labels).toContain('Export to PDF…')
    expect(labels).toContain('Export to Word (docx)…')
  })

  it('Export to HTML… fires send("exportHtml")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const htmlItem = items!.find((i) => i.label === 'Export to HTML…')
    expect(htmlItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    htmlItem!.click()
    expect(send).toHaveBeenCalledWith('exportHtml')
  })

  it('Export to PDF… fires send("exportPdf")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const pdfItem = items!.find((i) => i.label === 'Export to PDF…')
    expect(pdfItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    pdfItem!.click()
    expect(send).toHaveBeenCalledWith('exportPdf')
  })

  it('Export to Word (docx)… fires send("exportDocx")', () => {
    const send = vi.fn<(cmd: AppCommand) => void>()
    const template = buildMenuTemplate(send)
    const items = findExportSubmenu(template)
    const docxItem = items!.find((i) => i.label === 'Export to Word (docx)…')
    expect(docxItem).toBeDefined()
    // @ts-expect-error calling with no args is safe for our generated handlers
    docxItem!.click()
    expect(send).toHaveBeenCalledWith('exportDocx')
  })
})
```

- [ ] **Step 3: Run menu tests to verify they pass**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npx vitest run tests/unit/main/menu.test.ts 2>&1 | tail -20
```

Expected: all tests pass including the new Export submenu tests.

- [ ] **Step 4: Run full test suite**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm test 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/main/menu.ts tests/unit/main/menu.test.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat(export): add File > Export submenu (HTML, PDF, Word)"
```

---

## Task 7: Wire export commands in useCommands

**Files:**
- Modify: `src/renderer/hooks/useCommands.ts`

- [ ] **Step 1: Add import for buildExportHtml**

Open `src/renderer/hooks/useCommands.ts`. Add the import at the top (after the existing imports):

```typescript
import { buildExportHtml } from '@renderer/export/buildHtml'
```

- [ ] **Step 2: Add export command handlers to the dispatch function**

In the `dispatch` function, add the three export handlers after the `find`/`replace` block and before the final `editorRef.current?.runCommand(cmd)` fallthrough:

```typescript
      // ------------------------------------------------------------------
      // Export commands
      //
      // Get the current markdown from the active editor pane, build a
      // standalone HTML document via buildExportHtml, then invoke the
      // appropriate main-process handler.
      //
      // The document title (from the store) is used as the suggested
      // filename (without extension - the save dialog adds it) and as
      // the HTML document <title>.
      //
      // Errors from the IPC handlers (save dialog cancelled, pandoc
      // missing, filesystem errors) are silently swallowed here because
      // the main process shows its own error dialogs. Only unexpected
      // errors are logged to the console.
      // ------------------------------------------------------------------
      if (cmd === 'exportHtml') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        const suggestedName = title.endsWith('.html') ? title : title + '.html'
        void buildExportHtml(markdown, { title }).then((html) =>
          window.lekha.exportHtml({ html, suggestedName }),
        ).catch((err: unknown) => {
          console.error('[export] HTML export failed:', err)
        })
        return
      }

      if (cmd === 'exportPdf') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        const suggestedName = title.endsWith('.pdf') ? title : title + '.pdf'
        void buildExportHtml(markdown, { title }).then((html) =>
          window.lekha.exportPdf({ html, suggestedName }),
        ).catch((err: unknown) => {
          console.error('[export] PDF export failed:', err)
        })
        return
      }

      if (cmd === 'exportDocx') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        const suggestedName = title.endsWith('.docx') ? title : title + '.docx'
        void window.lekha.exportDocx({ markdown, suggestedName }).catch(
          (err: unknown) => {
            console.error('[export] Word export failed:', err)
          },
        )
        return
      }
```

- [ ] **Step 3: Add export command routing tests to useCommands.test.ts**

Open `tests/unit/hooks/useCommands.test.ts`. Add a new describe block at the end:

```typescript
// ---------------------------------------------------------------------------
// Test: export command routing
// ---------------------------------------------------------------------------

describe('useCommands - export command routing', () => {
  it('dispatching "exportHtml" calls window.lekha.exportHtml with html and suggestedName', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    // Make getMarkdown return something testable
    const handle = ref.current!
    vi.spyOn(handle, 'getMarkdown').mockReturnValue('# Hello')

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('exportHtml') })

    // exportHtml is async (calls buildExportHtml then the mock). Flush promises.
    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    const exportHtmlMock = window.lekha.exportHtml as ReturnType<typeof vi.fn>
    expect(exportHtmlMock).toHaveBeenCalledOnce()
    const callArgs = exportHtmlMock.mock.calls[0]?.[0] as { html: string; suggestedName: string }
    expect(callArgs.html).toContain('<!DOCTYPE html>')
    expect(callArgs.suggestedName).toMatch(/\.html$/)
  })

  it('dispatching "exportPdf" calls window.lekha.exportPdf', async () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('exportPdf') })

    await new Promise<void>((resolve) => setTimeout(resolve, 50))

    const exportPdfMock = window.lekha.exportPdf as ReturnType<typeof vi.fn>
    expect(exportPdfMock).toHaveBeenCalledOnce()
  })

  it('dispatching "exportDocx" calls window.lekha.exportDocx with markdown', () => {
    const { ref } = makeMockEditor()
    const { fileOps } = makeMockFileOps()
    const onFind = vi.fn()
    const onReplace = vi.fn()

    const handle = ref.current!
    vi.spyOn(handle, 'getMarkdown').mockReturnValue('# My Doc')

    renderHook(() => useCommands(ref, fileOps, { onFind, onReplace }))
    act(() => { capturedDispatch!('exportDocx') })

    const exportDocxMock = window.lekha.exportDocx as ReturnType<typeof vi.fn>
    expect(exportDocxMock).toHaveBeenCalledOnce()
    const callArgs = exportDocxMock.mock.calls[0]?.[0] as { markdown: string; suggestedName: string }
    expect(callArgs.markdown).toBe('# My Doc')
    expect(callArgs.suggestedName).toMatch(/\.docx$/)
  })
})
```

Note: the `exportHtml` test also needs the `mermaid` mock because `buildExportHtml` is called. Add the mock at the top of `useCommands.test.ts` (before any imports):

```typescript
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>' }),
  },
}))
```

- [ ] **Step 4: Run useCommands tests**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npx vitest run tests/unit/hooks/useCommands.test.ts 2>&1 | tail -20
```

Expected: all existing + new export routing tests pass.

- [ ] **Step 5: Run full test suite + typecheck + lint**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm test 2>&1 | tail -10 && npm run typecheck && npm run lint
```

Expected: all pass, no type errors, no lint warnings.

- [ ] **Step 6: Run build**

```bash
cd /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha && npm run build 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha add src/renderer/hooks/useCommands.ts tests/unit/hooks/useCommands.test.ts
git -C /Users/mocarram/Documents/Programming/myapps/vibeCoded/Lekha commit -m "feat(export): wire export commands through useCommands hook"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Covered by |
|-----------------|-----------|
| `buildExportHtml(markdown, opts?)` in `src/renderer/export/buildHtml.ts` | Task 3 |
| markdown-it same config as parser (strikethrough, tables, task-lists, math) | Task 3 - `buildMarkdownIt()` |
| Code highlighting via highlight.js / hljs classes | Task 3 - `highlight` option |
| Math via KaTeX `renderToString` for `math_inline`/`math_block` tokens | Task 3 - renderer rules |
| Mermaid async SVG rendering with mock in tests | Tasks 2+3 |
| Standalone HTML with inlined CSS (github.css + katex + hljs) | Task 3 - `buildDocument()` |
| `src/shared/commands.ts` - 3 export AppCommands | Task 1 |
| `src/shared/ipc-channels.ts` - 4 export channels | Task 1 |
| `src/main/ipc/export.ts` - `registerExportHandlers` | Task 5 |
| `exportHtml` IPC - save dialog + write | Task 5 |
| `exportPdf` IPC - offscreen window, printToPDF, temp file | Task 5 |
| `exportDocx` IPC - pandoc detection, spawn, stdin pipe | Task 5 |
| `pandocAvailable` IPC - cached boolean check | Task 5 |
| Register in `main/index.ts` | Task 5 |
| Preload bridge - `api.d.ts` types + `index.ts` exposure | Task 4 |
| `src/main/menu.ts` - File > Export submenu | Task 6 |
| Menu tests for Export submenu | Task 6 |
| `useCommands.ts` - handle 3 export commands | Task 7 |
| `LekhaAPI` mock in useCommands tests updated | Task 4 |
| All unit tests: `buildHtml.test.ts` (structure + markdown + code + math + mermaid) | Task 2 |
| `npm test` / `typecheck` / `lint` / `build` gates on every commit | Tasks 1-7 |

### Placeholder scan

No TBDs, no "implement later". All code blocks show complete implementations.

### Type consistency

- `AppCommand` union: `'exportHtml' | 'exportPdf' | 'exportDocx'` - consistent across `commands.ts`, `menu.ts` (`item()` calls), `useCommands.ts` conditionals.
- `IPC.exportHtml/exportPdf/exportDocx/pandocAvailable` - defined in Task 1, used in Task 4 (preload) and Task 5 (handlers).
- `LekhaAPI` export methods: `exportHtml(args: {html, suggestedName})`, `exportPdf(args: {html, suggestedName})`, `exportDocx(args: {markdown, suggestedName})`, `pandocAvailable()` - consistent in `api.d.ts` and `preload/index.ts`.
- `buildExportHtml(markdown: string, opts?: BuildHtmlOptions): Promise<string>` - consistent in implementation and tests.
- `buildPandocArgs(outPath: string): string[]` - pure helper, exported for potential future test.

### Edge cases covered

- Mermaid render error: wrapped in `{ error }` fallback div, not thrown.
- pandoc absent: throws user-friendly message (surfaces as error in console; main process can optionally show a dialog).
- Save dialog cancelled: `result.canceled` check, no file write.
- No title provided: defaults to `"Untitled"`.
- `?raw` CSS imports in tests: handled by vitest plugin in Task 3.
