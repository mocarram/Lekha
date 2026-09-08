# Lekha Markdown Preview (VS Code)

View Markdown in a VS Code tab with [Lekha](https://github.com/mocarram/Lekha)'s
clean, GitHub-flavored look — the same typography, themes, math, diagrams, and
syntax highlighting as the Lekha editor.

This extension reuses Lekha's rendering pipeline and design tokens directly:

- **Rendering** — `markdown-it` (CommonMark + GFM strikethrough/tables/task-lists,
  emoji, sub/sup, `==mark==`, footnotes) plus Lekha's `$…$` / `$$…$$` math plugin.
- **Math** — [KaTeX](https://katex.org), rendered in the extension host.
- **Code** — [highlight.js](https://highlightjs.org), colored through Lekha's
  design tokens so it follows the active theme.
- **Diagrams** — [Mermaid](https://mermaid.js.org), rendered client-side in the
  webview.
- **Look** — Lekha's `tokens.css` + `github.css` (light) and `night.css` (dark),
  copied verbatim, applied to Lekha's own `.editor-pane > .ProseMirror`
  structure so every content style matches the editor.

## Two ways to view

- **In the tab** — right-click a `.md` file → **Reopen Editor With…** → **Lekha
  Markdown Preview**. Registered as an _option_, so the normal text editor stays
  the default.
- **Beside the source** — **Lekha: Open Preview to the Side**
  (`Ctrl/Cmd+Shift+L`), or the preview icon in the editor title bar. Updates live
  as you type.

## Settings

| Setting              | Default   | Description                                             |
| -------------------- | --------- | ------------------------------------------------------ |
| `lekha.theme`        | `auto`    | `auto` (follow VS Code), `github` (light), or `night`. |
| `lekha.fontSize`     | `16`      | Base font size (px) for the rendered document.         |
| `lekha.contentWidth` | `820px`   | Max width of the reading column (any CSS length).      |

## Develop

```bash
cd vscode-extension
npm install
npm run build      # bundles the extension + webview client, vendors KaTeX assets
```

Then press **F5** in VS Code (with this folder open) to launch an Extension
Development Host.

### How it's built

- `src/extension.ts` — activation, the custom editor provider (renders in the
  tab), and the side-preview command. A single `PreviewSession` keeps a webview
  in sync with a document.
- `src/renderer.ts` — Markdown → HTML in the extension host (Node). Mirrors
  Lekha's `buildHtml.ts`. `mermaid` fences are emitted as `<pre class="mermaid">`
  for the webview to render, since Mermaid needs a DOM the host lacks.
- `src/webview/client.ts` — runs in the webview: sanitizes with DOMPurify,
  applies the theme, renders Mermaid, routes link clicks back to the host.
- `media/lekha/*.css` — copied verbatim from Lekha (design tokens + themes).

## Status & known gaps

This is an initial implementation (Phases 1–2 of the plan). The rendering
pipeline compiles and has a unit smoke test, but **it has not yet been exercised
inside a running VS Code Extension Development Host** — that verification is the
next step. Known follow-ups:

- Editor ↔ preview scroll sync is approximate (ratio-based), not source-mapped.
- Footnote markup uses `markdown-it-footnote`, which differs slightly from
  Lekha's custom footnote styling.
- No document outline / table-of-contents panel yet.
- Not yet packaged (`.vsix`) or published to a marketplace.

## License

MIT — same as Lekha.
