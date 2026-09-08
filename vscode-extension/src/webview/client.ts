/**
 * client.ts — runs inside the webview (browser context).
 *
 * Receives rendered HTML from the extension host, sanitizes it with DOMPurify
 * against the real DOM, injects it, applies the Lekha theme + type settings,
 * and renders any ```mermaid diagrams client-side (Mermaid needs a DOM the host
 * lacks). Links are routed back to the host so VS Code opens them.
 *
 * Bundled to media/webview.js by esbuild (DOMPurify + Mermaid included).
 */
import DOMPurify from 'dompurify'
import mermaid from 'mermaid'

interface UpdateMessage {
  type: 'update'
  html: string
  theme: 'github' | 'night'
  fontSize: number
  contentWidth: string
}

interface VsCodeApi {
  postMessage(msg: unknown): void
}
declare function acquireVsCodeApi(): VsCodeApi

const vscode = acquireVsCodeApi()
const content = document.getElementById('content') as HTMLElement

let mermaidReady = false
let currentMermaidTheme: 'default' | 'dark' = 'default'
let mermaidSeq = 0

function sanitize(html: string): string {
  // Matches Lekha's export sanitizer: keep the markup KaTeX/hljs/Mermaid need,
  // drop scripts, event handlers, iframes and javascript: URLs.
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    ADD_ATTR: ['class', 'style', 'target', 'rel'],
    ADD_TAGS: ['foreignObject'],
  })
}

function applyTheme(theme: 'github' | 'night', fontSize: number, contentWidth: string): void {
  const root = document.documentElement
  // 'github' is Lekha's default :root palette (no data-theme); 'night' opts in.
  if (theme === 'night') root.dataset.theme = 'night'
  else delete root.dataset.theme
  root.style.setProperty('--editor-font-size', `${fontSize}px`)
  root.style.setProperty('--editor-max-width', contentWidth)
  currentMermaidTheme = theme === 'night' ? 'dark' : 'default'
}

function ensureMermaid(): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: currentMermaidTheme,
  })
  mermaidReady = true
}

async function renderMermaidBlocks(): Promise<void> {
  const blocks = Array.from(content.querySelectorAll<HTMLElement>('pre.mermaid'))
  if (blocks.length === 0) return
  ensureMermaid()
  for (const block of blocks) {
    const code = block.textContent ?? ''
    const id = `lekha-mermaid-${mermaidSeq++}`
    try {
      const { svg } = await mermaid.render(id, code)
      const wrap = document.createElement('div')
      wrap.className = 'mermaid'
      wrap.setAttribute('data-processed', 'true')
      wrap.innerHTML = svg
      block.replaceWith(wrap)
    } catch (err) {
      const pre = document.createElement('pre')
      pre.className = 'lekha-mermaid-error'
      pre.textContent = `Mermaid error: ${err instanceof Error ? err.message : String(err)}`
      block.replaceWith(pre)
    }
  }
}

function wireLinks(): void {
  content.addEventListener('click', (e) => {
    const anchor = (e.target as HTMLElement)?.closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href) return
    e.preventDefault()
    if (href.startsWith('#')) {
      // In-page anchor: scroll to the matching heading/footnote.
      const id = decodeURIComponent(href.slice(1))
      const target =
        document.getElementById(id) ||
        content.querySelector(`[name="${CSS.escape(id)}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    vscode.postMessage({ type: 'link', href })
  })
}

function update(msg: UpdateMessage): void {
  const pane = document.querySelector('.editor-pane') as HTMLElement | null
  const prevRatio =
    pane && pane.scrollHeight > pane.clientHeight
      ? pane.scrollTop / (pane.scrollHeight - pane.clientHeight)
      : 0

  applyTheme(msg.theme, msg.fontSize, msg.contentWidth)
  // Re-init mermaid theme if it already loaded, so diagrams follow theme changes.
  if (mermaidReady) ensureMermaid()

  content.innerHTML = sanitize(msg.html)
  void renderMermaidBlocks()

  if (pane) {
    const restore = (): void => {
      const max = pane.scrollHeight - pane.clientHeight
      pane.scrollTop = Math.round(prevRatio * Math.max(0, max))
    }
    requestAnimationFrame(restore)
  }
}

window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as { type?: string }
  if (msg?.type === 'update') update(msg as UpdateMessage)
})

wireLinks()
vscode.postMessage({ type: 'ready' })
