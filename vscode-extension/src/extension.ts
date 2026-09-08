/**
 * extension.ts — activation, custom editor, and the "open preview to the side"
 * command.
 *
 * A single PreviewSession wires one webview to one text document: it renders the
 * markdown (renderer.ts), streams the HTML into the webview, and keeps it live
 * on document edits, configuration changes, and color-theme changes. Both entry
 * points — the custom editor (renders in the tab) and the side-panel command —
 * use the same session, so they look and behave identically.
 */
import * as vscode from 'vscode'
import { renderMarkdown } from './renderer'
import { buildWebviewHtml } from './webviewContent'

const VIEW_TYPE = 'lekha.markdownPreview'

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

interface LekhaSettings {
  theme: 'github' | 'night'
  fontSize: number
  contentWidth: string
}

function resolveSettings(): LekhaSettings {
  const cfg = vscode.workspace.getConfiguration('lekha')
  const themeSetting = cfg.get<string>('theme', 'auto')
  let theme: 'github' | 'night'
  if (themeSetting === 'github' || themeSetting === 'night') {
    theme = themeSetting
  } else {
    // auto → follow VS Code's active theme kind
    const kind = vscode.window.activeColorTheme.kind
    theme =
      kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast
        ? 'night'
        : 'github'
  }
  return {
    theme,
    fontSize: cfg.get<number>('fontSize', 16),
    contentWidth: cfg.get<string>('contentWidth', '820px'),
  }
}

// ---------------------------------------------------------------------------
// Preview session
// ---------------------------------------------------------------------------

class PreviewSession {
  private readonly disposables: vscode.Disposable[] = []
  private debounce: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly document: vscode.TextDocument,
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: this.resourceRoots(),
    }
    panel.webview.html = buildWebviewHtml(panel.webview, extensionUri)

    // Messages from the webview.
    this.disposables.push(
      panel.webview.onDidReceiveMessage((msg: unknown) => this.onMessage(msg)),
    )

    // Re-render when this document changes.
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() === this.document.uri.toString()) this.scheduleUpdate()
      }),
    )

    // Re-render on config or theme changes (both can change the look).
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('lekha')) this.update()
      }),
      vscode.window.onDidChangeActiveColorTheme(() => this.update()),
    )

    panel.onDidDispose(() => this.dispose(), null, this.disposables)
  }

  private resourceRoots(): vscode.Uri[] {
    const roots = [vscode.Uri.joinPath(this.extensionUri, 'media')]
    const docDir = vscode.Uri.joinPath(this.document.uri, '..')
    roots.push(docDir)
    const folder = vscode.workspace.getWorkspaceFolder(this.document.uri)
    if (folder) roots.push(folder.uri)
    return roots
  }

  private onMessage(msg: unknown): void {
    if (typeof msg !== 'object' || msg === null || !('type' in msg)) return
    const m = msg as { type: string; href?: string }
    if (m.type === 'ready') {
      this.update()
    } else if (m.type === 'link' && typeof m.href === 'string') {
      this.openLink(m.href)
    }
  }

  private openLink(href: string): void {
    if (/^(https?|mailto):/i.test(href)) {
      void vscode.env.openExternal(vscode.Uri.parse(href))
      return
    }
    // Resolve a relative link against the document's folder and open it.
    try {
      const target = vscode.Uri.joinPath(this.document.uri, '..', href.replace(/[#?].*$/, ''))
      void vscode.commands.executeCommand('vscode.open', target)
    } catch {
      /* ignore unresolvable links */
    }
  }

  private scheduleUpdate(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = setTimeout(() => this.update(), 120)
  }

  private update(): void {
    const settings = resolveSettings()
    const { html } = renderMarkdown(this.document.getText(), (rel) => {
      const uri = vscode.Uri.joinPath(this.document.uri, '..', rel)
      return this.panel.webview.asWebviewUri(uri).toString()
    })
    void this.panel.webview.postMessage({
      type: 'update',
      html,
      theme: settings.theme,
      fontSize: settings.fontSize,
      contentWidth: settings.contentWidth,
    })
  }

  private dispose(): void {
    if (this.debounce) clearTimeout(this.debounce)
    while (this.disposables.length) this.disposables.pop()?.dispose()
  }
}

// ---------------------------------------------------------------------------
// Custom editor provider (renders markdown IN the tab)
// ---------------------------------------------------------------------------

class LekhaEditorProvider implements vscode.CustomTextEditorProvider {
  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): void {
    new PreviewSession(document, webviewPanel, this.extensionUri)
  }
}

// ---------------------------------------------------------------------------
// Side-panel command
// ---------------------------------------------------------------------------

// Track side panels by document so the command reveals an existing one.
const sidePanels = new Map<string, vscode.WebviewPanel>()

function openPreview(extensionUri: vscode.Uri, toSide: boolean): void {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    void vscode.window.showInformationMessage('Open a Markdown file first.')
    return
  }
  const document = editor.document
  const key = document.uri.toString()

  const existing = sidePanels.get(key)
  if (existing) {
    existing.reveal(toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active)
    return
  }

  const panel = vscode.window.createWebviewPanel(
    VIEW_TYPE,
    `Preview ${nameOf(document.uri)}`,
    toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true },
  )
  sidePanels.set(key, panel)
  panel.onDidDispose(() => sidePanels.delete(key))
  new PreviewSession(document, panel, extensionUri)
}

function nameOf(uri: vscode.Uri): string {
  const parts = uri.path.split('/')
  return parts[parts.length - 1] || uri.path
}

// ---------------------------------------------------------------------------
// Activation
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      VIEW_TYPE,
      new LekhaEditorProvider(context.extensionUri),
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      },
    ),
    vscode.commands.registerCommand('lekha.openPreviewToSide', () =>
      openPreview(context.extensionUri, true),
    ),
    vscode.commands.registerCommand('lekha.openPreview', () =>
      openPreview(context.extensionUri, false),
    ),
  )
}

export function deactivate(): void {
  /* nothing to clean up beyond context.subscriptions */
}
