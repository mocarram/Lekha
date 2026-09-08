/**
 * renderer.ts — Markdown → HTML, host side.
 *
 * Mirrors Lekha's export pipeline (src/renderer/export/buildHtml.ts): a
 * markdown-it instance (CommonMark + GFM strikethrough/tables/task-lists +
 * emoji/sub/sup/mark/footnotes + Lekha's $…$/$$…$$ math plugin), with:
 *   - highlight.js colouring for fenced code,
 *   - KaTeX render rules for the math tokens,
 *   - ```mermaid fences emitted as <pre class="mermaid"> for the webview to
 *     render (Mermaid needs a DOM, which the extension host does not have).
 *
 * The produced string is the INNER HTML of a `.ProseMirror` container. It is
 * NOT sanitized here — the webview sanitizes with DOMPurify against a real DOM
 * before inserting it (see src/webview/client.ts).
 */
import MarkdownIt from 'markdown-it'
import katex from 'katex'
import hljs from 'highlight.js'
import taskLists from 'markdown-it-task-lists'
import markPlugin from 'markdown-it-mark'
import subPlugin from 'markdown-it-sub'
import supPlugin from 'markdown-it-sup'
import footnotePlugin from 'markdown-it-footnote'
import { full as emojiPlugin } from 'markdown-it-emoji'
import { mathPlugin } from './math-plugin'

/** Resolve an image/link path (as written in the doc) to a URL the webview can load. */
export type UriResolver = (relativePath: string) => string

function renderMath(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore',
  })
}

function buildMarkdownIt(resolveUri: UriResolver): MarkdownIt {
  const md = new MarkdownIt('commonmark', {
    // html:true passes the user's own inline HTML through; the webview
    // sanitizes the result with DOMPurify, so this is safe here.
    html: true,
    linkify: true,
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
          /* fall through to default escaping */
        }
      }
      return '<pre><code class="hljs">' + md.utils.escapeHtml(code) + '</code></pre>'
    },
  })
    .enable(['strikethrough', 'table'])
    .use(taskLists, { label: true })
    .use(markPlugin)
    .use(subPlugin)
    .use(supPlugin)
    .use(emojiPlugin)
    .use(footnotePlugin)
    .use(mathPlugin)

  // --- KaTeX render rules for the math tokens the plugin emits ---
  md.renderer.rules['math_inline'] = (tokens, idx): string =>
    renderMath(tokens[idx]?.content ?? '', false)

  md.renderer.rules['math_block'] = (tokens, idx): string =>
    '<p>' + renderMath(tokens[idx]?.content ?? '', true) + '</p>\n'

  // --- ```mermaid fences → <pre class="mermaid"> for client-side rendering ---
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, self): string => {
    const token = tokens[idx]
    const info = token ? token.info.trim().split(/\s+/g)[0] : ''
    if (info === 'mermaid') {
      return `<pre class="mermaid">${md.utils.escapeHtml(token?.content ?? '')}</pre>\n`
    }
    return defaultFence
      ? defaultFence(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  // --- Rewrite relative image sources to webview-loadable URIs ---
  const defaultImage = md.renderer.rules.image?.bind(md.renderer.rules)
  md.renderer.rules.image = (tokens, idx, options, env, self): string => {
    const token = tokens[idx]
    if (token) {
      const srcIndex = token.attrIndex('src')
      if (srcIndex >= 0 && token.attrs) {
        const src = token.attrs[srcIndex]?.[1] ?? ''
        if (isRelative(src)) {
          token.attrs[srcIndex]![1] = resolveUri(src)
        }
      }
    }
    return defaultImage
      ? defaultImage(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  return md
}

/** True for paths we should resolve against the document (not absolute URLs). */
function isRelative(src: string): boolean {
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(src)
}

/** Strip a leading YAML front-matter block so it is not rendered as content. */
function stripFrontMatter(markdown: string): string {
  if (!markdown.startsWith('---')) return markdown
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(markdown)
  return match ? markdown.slice(match[0].length) : markdown
}

export interface RenderResult {
  html: string
}

/**
 * Render markdown to the inner HTML of a `.ProseMirror` container.
 * `resolveUri` converts relative image paths to webview URIs.
 */
export function renderMarkdown(markdown: string, resolveUri: UriResolver): RenderResult {
  const md = buildMarkdownIt(resolveUri)
  const html = md.render(stripFrontMatter(markdown))
  return { html }
}
