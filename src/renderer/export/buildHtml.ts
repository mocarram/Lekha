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
// (vitest/happy-dom) a plugin stubs ?raw imports to empty strings so no Vite
// pipeline is needed at test time. The actual CSS appears in the build output.
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
  const md = new MarkdownIt('commonmark', {
    // html: true is safe here because we are exporting the user's own content,
    // not rendering untrusted third-party markdown. It also allows our mermaid
    // placeholder comments to pass through the renderer without being escaped.
    html: true,
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
      const escaped = new MarkdownIt().utils.escapeHtml(result.error)
      svg = `<div class="mermaid-error"><pre>${escaped}</pre></div>`
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
 * Render `markdown` to an HTML body fragment (no `<html>`/`<head>` wrapper).
 *
 * The returned string is the inner HTML of a `.markdown-body` container:
 * headings, paragraphs, code blocks (highlighted), math (KaTeX), and mermaid
 * diagrams (inline SVG). It does NOT include a doctype, `<html>`, `<head>`,
 * or `<body>` tag.
 *
 * This is the shared rendering core used by both `buildExportHtml` (which wraps
 * the result in a full standalone document) and the presentation overlay (which
 * injects the fragment directly into a slide `<div>`).
 *
 * @param markdown - Raw markdown source text.
 * @returns        Rendered HTML body fragment as a string.
 */
export async function renderMarkdownBody(markdown: string): Promise<string> {
  // 1. Extract mermaid blocks and render them asynchronously
  const { processed, blocks } = await extractAndRenderMermaid(markdown)

  // 2. Build and run the markdown-it renderer
  const md = buildMarkdownIt()
  let body = md.render(processed)

  // 3. Reinsert the rendered mermaid SVGs
  body = reinsertMermaid(body, blocks)

  return body
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
 * Internally delegates to `renderMarkdownBody` so the rendering pipeline is
 * shared with the presentation overlay (DRY - no duplication).
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

  // 1. Render the markdown body (mermaid + math + code highlighting)
  const body = await renderMarkdownBody(markdown)

  // 2. Concatenate all CSS (github theme + katex + hljs)
  const cssBlob = [githubCss, katexCss, hljsCss].join('\n\n')

  // 3. Assemble the complete HTML document
  return buildDocument(body, title, cssBlob)
}
