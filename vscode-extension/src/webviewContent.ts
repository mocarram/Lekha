/**
 * webviewContent.ts — builds the static HTML shell loaded into the webview.
 *
 * The shell links Lekha's design tokens + themes and KaTeX's stylesheet, sets a
 * strict Content-Security-Policy, and reproduces Lekha's DOM structure
 * (`.editor-pane > .ProseMirror`) so every editor content rule in github.css
 * applies verbatim. The rendered markdown is streamed in later via postMessage
 * and injected into `#content`; only the nonce'd webview.js may run.
 */
import * as vscode from 'vscode'

function nonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let text = ''
  for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length))
  return text
}

export function buildWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const media = (...p: string[]): vscode.Uri =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', ...p))

  const tokensCss = media('lekha', 'tokens.css')
  const githubCss = media('lekha', 'github.css')
  const nightCss = media('lekha', 'night.css')
  const katexCss = media('vendor', 'katex.min.css')
  const webviewJs = media('webview.js')

  const n = nonce()
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${n}'`,
  ].join('; ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="${tokensCss}" />
  <link rel="stylesheet" href="${githubCss}" />
  <link rel="stylesheet" href="${nightCss}" />
  <link rel="stylesheet" href="${katexCss}" />
  <style>
    html, body { height: 100%; }
    body { margin: 0; background: var(--bg); }
    /* The editor pane owns scrolling and paints the themed background. */
    .editor-pane { height: 100vh; }
    /* Give the reading column its width/size from settings (mirrors Lekha). */
    :root { --editor-font-size: 16px; }
    .mermaid { text-align: center; margin: 1em 0; background: none; padding: 0; }
    .mermaid[data-processed] { line-height: normal; }
    .lekha-mermaid-error {
      border: 1px solid var(--danger, #cb2431);
      border-radius: var(--radius, 6px);
      padding: 8px 12px;
      color: var(--danger, #cb2431);
      font-family: var(--font-mono);
      font-size: 0.85em;
      white-space: pre-wrap;
    }
    #content:empty::before {
      content: "";
      display: block;
    }
  </style>
</head>
<body>
  <div class="editor-pane">
    <div class="ProseMirror markdown-body" id="content"></div>
  </div>
  <script nonce="${n}" src="${webviewJs}"></script>
</body>
</html>`
}
