/**
 * useCommands.ts
 *
 * Central command dispatcher. Subscribes to AppCommands broadcast from the
 * main process (via window.lekha.onCommand) and routes each command to the
 * appropriate handler:
 *
 *   File ops  - new, open, openFolder, save, saveAs
 *   Sidebar   - toggleSidebar (via useWorkspaceStore)
 *   Mode      - toggleSource (via editorRef.toggleMode + store sync)
 *   Find/Repl - find, replace (callbacks injected by App; UI built in M13)
 *   Editor    - everything else routed to editorRef.runCommand (formatting,
 *               headings, lists, undo/redo, etc.)
 *
 * Unsubscribes automatically on unmount.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { AppCommand } from '@shared/commands'
import type { PandocFormat } from '@shared/types'
import { pandocExtension } from '@shared/pandocFormats'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import { useDocumentsStore, nextTabId } from '@renderer/store/documentsStore'
import { injectUserThemes, applyTheme, THEMES } from '@renderer/themes/index'
import { applyChromeZoom } from '@renderer/chromeZoom'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'
import type { FileOps } from './useFileOps'
// Lazy HTML export pipeline (katex/highlight.js/markdown-it), shared with App's
// per-tab Copy as HTML. Dynamic-imported on first use, kept out of the initial
// chunk; see lazyBuildHtml.ts.
import { loadBuildExportHtml, loadRenderMarkdownBody } from '@renderer/export/lazyBuildHtml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload passed to onLink describing how the link dialog should open. */
export interface LinkDialogRequest {
  mode: 'insert' | 'edit'
  initial: { text: string; href: string; title?: string }
}

/**
 * Maps each pandoc export AppCommand to its target PandocFormat. The output file
 * extension is derived from the shared PANDOC_EXTENSIONS map (@shared/pandocFormats)
 * at dispatch time, so the format -> extension table has a single definition
 * shared with the main process.
 */
const PANDOC_COMMAND_MAP: Record<string, { format: PandocFormat }> = {
  exportDocx: { format: 'docx' },
  exportEpub: { format: 'epub' },
  exportRtf: { format: 'rtf' },
  exportLatex: { format: 'latex' },
  exportOpml: { format: 'opml' },
}

export interface CommandOpts {
  /** Called when the "find" command is dispatched. Shown in M13. */
  onFind: () => void
  /** Called when the "replace" command is dispatched. Shown in M13. */
  onReplace: () => void
  /** Open the link dialog (insert or edit) with the given prefill. */
  onLink: (request: LinkDialogRequest) => void
  /** Open the image dialog. */
  onInsertImage: () => void
  /** Open the Preferences modal. */
  onPreferences: () => void
  /** Open the command palette in 'commands' mode (Cmd+Shift+P). */
  onCommandPalette: () => void
  /** Open the command palette in 'files' (quick-open) mode (Cmd+P). */
  onQuickOpen: () => void
  /** Open the presentation (slideshow) overlay. */
  onPresentation: () => void
  /** Open the template picker modal. */
  onNewFromTemplate: () => void
  /**
   * Open the rename dialog for the current document. Optional so existing
   * callers/tests that don't wire renaming keep working.
   */
  onRename?: () => void
  /** Open the Get Info dialog for the current document. Optional. */
  onGetInfo?: () => void
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to AppCommands from the main process and route them to the
 * correct handler.
 *
 * @param editorRef - Ref to the EditorPaneHandle for formatting/mode commands.
 * @param fileOps   - File operation callbacks from useFileOps.
 * @param opts      - Callbacks for find/replace overlay (built in M13).
 * @returns The shared `dispatch(cmd)` so the command palette can run any
 *   command through the exact same routing path as the native menu / IPC.
 */
export function useCommands(
  editorRef: RefObject<EditorPaneHandle | null>,
  fileOps: FileOps,
  opts: CommandOpts,
): (cmd: AppCommand) => void {
  // Ref-to-latest-callbacks: keep fileOps and opts current without
  // re-subscribing to onCommand on every render (the IPC listener is set up
  // once on mount; the refs ensure it always sees the latest values).
  // Updated in useLayoutEffect so they are current before any async events fire,
  // but without mutating refs during render (which React's strict mode disallows).
  const fileOpsRef = useRef(fileOps)
  const optsRef = useRef(opts)
  useLayoutEffect(() => {
    fileOpsRef.current = fileOps
    optsRef.current = opts
  })

  // The single command router. Stable identity (refs hold the latest deps), so
  // it is safe to subscribe with it once AND hand it to the palette to call
  // directly - both paths run the exact same routing logic.
  const dispatch = useCallback((cmd: AppCommand): void => {
      const fo = fileOpsRef.current
      const o = optsRef.current
      // ------------------------------------------------------------------
      // File operations
      // ------------------------------------------------------------------
      if (cmd === 'new') {
        void fo.newFile()
        return
      }
      if (cmd === 'print') {
        // Open the native print dialog for this window (main calls
        // webContents.print on the sender).
        window.lekha.print()
        return
      }
      if (cmd === 'share') {
        // Share the current file via the macOS share sheet (main popup).
        const path = useEditorStore.getState().path
        if (path) window.lekha.share(path)
        return
      }
      if (cmd === 'newWindow') {
        // Ask main to open a fresh, independent window. The native menu opens
        // windows directly in main; this path covers the renderer-routed case.
        window.lekha.newWindow()
        return
      }
      if (cmd === 'open') {
        void fo.open()
        return
      }
      if (cmd === 'openFolder') {
        void fo.openFolder()
        return
      }
      if (cmd === 'save') {
        void fo.save()
        return
      }
      if (cmd === 'saveAs') {
        void fo.saveAs()
        return
      }
      if (cmd === 'revertToSaved') {
        void fo.revertToSaved()
        return
      }
      if (cmd === 'saveAllAndClose') {
        // Main's window-close guard chose "Save": save EVERY dirty tab so the
        // window can close clean (a cancelled Save As keeps the window open).
        void fo.saveAllForClose()
        return
      }
      if (cmd === 'discardAllAndClose') {
        // Main's window-close guard chose "Don't Save": drop EVERY tab's crash
        // backup and mark all clean so the close completes without saving.
        void fo.discardAllForClose()
        return
      }
      if (cmd === 'duplicateFile') {
        void fo.duplicateCurrent()
        return
      }
      if (cmd === 'moveFileTo') {
        void fo.moveCurrentTo()
        return
      }
      if (cmd === 'renameFile') {
        // App hosts the rename dialog (Electron has no window.prompt).
        o.onRename?.()
        return
      }
      if (cmd === 'getInfo') {
        o.onGetInfo?.()
        return
      }
      if (cmd === 'deleteFile') {
        void fo.deleteCurrent()
        return
      }
      if (cmd === 'nextTab' || cmd === 'previousTab') {
        const { documents, activeId } = useDocumentsStore.getState()
        const target = nextTabId(documents, activeId, cmd === 'nextTab' ? 1 : -1)
        if (target !== null && target !== activeId) void fo.selectTab(target)
        return
      }
      if (cmd === 'closeTab') {
        const { activeId } = useDocumentsStore.getState()
        if (activeId !== null) void fo.closeTab(activeId)
        return
      }
      if (cmd === 'openThemeFolder') {
        void window.lekha.openThemeFolder()
        return
      }
      if (cmd === 'reloadThemes') {
        // Re-scan the user themes folder and re-inject the CSS so newly edited
        // or added themes take effect without a restart.
        void window.lekha
          .reloadThemes()
          .then((themes) => {
            injectUserThemes(themes)
            // If the active theme's file was removed, it no longer resolves -
            // fall back to the default so the UI is not left on a dead theme.
            const current = document.documentElement.dataset['theme'] ?? 'github'
            const isBuiltin = THEMES.some((t) => t.id === current)
            const isUser = themes.some((t) => t.id === current)
            if (!isBuiltin && !isUser) {
              applyTheme('github')
              if (typeof window.lekha !== 'undefined') {
                void window.lekha.setSettings({ theme: 'github' })
              }
            }
          })
          .catch((err: unknown) => {
            window.alert(
              `Failed to reload themes:\n${err instanceof Error ? err.message : String(err)}`,
            )
          })
        return
      }
      if (cmd === 'showInFinder') {
        // Reveal the current document in the OS file manager.
        const path = useEditorStore.getState().path
        if (path) void window.lekha.revealPath(path)
        return
      }
      if (cmd === 'revealInFileTree') {
        // Ensure the sidebar's Files tab is visible; the active file
        // auto-reveals (FileTree expands ancestors + scrolls to it).
        useWorkspaceStore.getState().setSidebarVisible(true)
        useWorkspaceStore.getState().setSidebarTab('files')
        return
      }
      if (cmd === 'revealInLibrary') {
        // Show the Articles/Library list (the active file row is highlighted).
        useWorkspaceStore.getState().setSidebarVisible(true)
        useWorkspaceStore.getState().setSidebarTab('articles')
        return
      }

      // ------------------------------------------------------------------
      // Sidebar toggle (workspace store)
      // ------------------------------------------------------------------
      if (cmd === 'toggleSidebar') {
        useWorkspaceStore.getState().toggleSidebar()
        return
      }
      if (cmd === 'toggleStatusBar') {
        useWorkspaceStore.getState().toggleStatusBar()
        return
      }
      if (cmd === 'toggleAlwaysOnTop') {
        const next = !useWorkspaceStore.getState().alwaysOnTop
        useWorkspaceStore.getState().setAlwaysOnTop(next)
        window.lekha.setAlwaysOnTop(next)
        return
      }

      // ------------------------------------------------------------------
      // Window zoom (View menu). Main applies the zoom and returns the
      // resulting factor; the chrome that is anchored to the NATIVE traffic
      // lights re-compensates from it (see chromeZoom.ts).
      // ------------------------------------------------------------------
      if (cmd === 'zoomIn' || cmd === 'zoomOut' || cmd === 'zoomReset') {
        const action = cmd === 'zoomIn' ? 'in' : cmd === 'zoomOut' ? 'out' : 'reset'
        void window.lekha.adjustZoom(action).then(applyChromeZoom)
        return
      }

      // ------------------------------------------------------------------
      // Source mode toggle (editor pane + store sync)
      // ------------------------------------------------------------------
      if (cmd === 'toggleSource') {
        // toggleMode() returns the new mode synchronously so we can sync the
        // store without a stale read (React state hasn't re-rendered yet).
        const next = editorRef.current?.toggleMode()
        if (next !== undefined) {
          useEditorStore.getState().setMode(next)
        }
        return
      }

      // ------------------------------------------------------------------
      // Find / Replace (overlay opened in M13)
      // ------------------------------------------------------------------
      if (cmd === 'find') {
        o.onFind()
        return
      }
      if (cmd === 'replace') {
        o.onReplace()
        return
      }

      // ------------------------------------------------------------------
      // Link dialog (insert / edit)
      //
      // If the cursor sits on an existing link, open in edit mode prefilled
      // with its text/href. Otherwise open in insert mode, prefilling the
      // text with the current selection (so "select text -> Cmd+K" links it).
      // ------------------------------------------------------------------
      if (cmd === 'link') {
        const editor = editorRef.current
        if (!editor) return
        const link = editor.getLinkAt()
        if (link) {
          o.onLink({
            mode: 'edit',
            initial: {
              text: link.text,
              href: link.href,
              ...(link.title ? { title: link.title } : {}),
            },
          })
        } else {
          o.onLink({
            mode: 'insert',
            initial: { text: editor.getSelectionText(), href: '' },
          })
        }
        return
      }

      // ------------------------------------------------------------------
      // Image dialog
      // ------------------------------------------------------------------
      if (cmd === 'insertImage') {
        o.onInsertImage()
        return
      }

      // ------------------------------------------------------------------
      // Preferences modal (App state)
      // ------------------------------------------------------------------
      if (cmd === 'preferences') {
        o.onPreferences()
        return
      }

      // ------------------------------------------------------------------
      // Command palette / quick-open (App-hosted overlay)
      // ------------------------------------------------------------------
      if (cmd === 'commandPalette') {
        o.onCommandPalette()
        return
      }
      if (cmd === 'quickOpen') {
        o.onQuickOpen()
        return
      }

      // ------------------------------------------------------------------
      // Presentation mode (slides overlay)
      // ------------------------------------------------------------------
      if (cmd === 'presentation') {
        o.onPresentation()
        return
      }

      // ------------------------------------------------------------------
      // Template picker
      // ------------------------------------------------------------------
      if (cmd === 'newFromTemplate') {
        o.onNewFromTemplate()
        return
      }

      // ------------------------------------------------------------------
      // Focus mode toggle (store + persist)
      // Read the current value, toggle, then persist the new value.
      // ------------------------------------------------------------------
      if (cmd === 'toggleFocusMode') {
        useEditorStore.getState().toggleFocusMode()
        const { focusMode } = useEditorStore.getState()
        void window.lekha.setSettings({ focusMode })
        return
      }

      // ------------------------------------------------------------------
      // Typewriter mode toggle (store + persist)
      // Read the current value, toggle, then persist the new value.
      // ------------------------------------------------------------------
      if (cmd === 'toggleTypewriterMode') {
        useEditorStore.getState().toggleTypewriterMode()
        const { typewriterMode } = useEditorStore.getState()
        void window.lekha.setSettings({ typewriterMode })
        return
      }

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
        void loadBuildExportHtml()
          .then((build) => build(markdown, { title }))
          .then((html) => window.lekha.exportHtml({ html, suggestedName }))
          .catch((err: unknown) => {
            console.error('[export] HTML export failed:', err)
          })
        return
      }

      if (cmd === 'exportPdf') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        const suggestedName = title.endsWith('.pdf') ? title : title + '.pdf'
        void loadBuildExportHtml()
          .then((build) => build(markdown, { title }))
          .then((html) => window.lekha.exportPdf({ html, suggestedName }))
          .catch((err: unknown) => {
            console.error('[export] PDF export failed:', err)
          })
        return
      }

      // Pandoc exports (docx/epub/rtf/latex/opml). Each command maps to a
      // PandocFormat + the output file extension used for the suggested name.
      // The actual writer/extension mapping lives in the main process; here we
      // only need the extension to seed the save-dialog default name.
      const pandocCmd = PANDOC_COMMAND_MAP[cmd as keyof typeof PANDOC_COMMAND_MAP]
      if (pandocCmd !== undefined) {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        const dotExt = `.${pandocExtension(pandocCmd.format)}`
        const suggestedName = title.endsWith(dotExt) ? title : title + dotExt
        void window.lekha
          .exportPandoc({ markdown, suggestedName, format: pandocCmd.format })
          .catch((err: unknown) => {
            console.error(`[export] ${pandocCmd.format} export failed:`, err)
          })
        return
      }

      // ------------------------------------------------------------------
      // Copy as Markdown
      //
      // Grab the current markdown from the active editor and write it to the
      // system clipboard as plain text via the main-process clipboard bridge.
      // ------------------------------------------------------------------
      if (cmd === 'copyAsMarkdown') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        void window.lekha.writeClipboard({ text: markdown }).catch((err: unknown) => {
          console.error('[clipboard] Copy as Markdown failed:', err)
        })
        return
      }

      // Paste as Plain Text: insert the clipboard's plain text at the cursor.
      if (cmd === 'pasteAsPlainText') {
        void window.lekha
          .readClipboardText()
          .then((text) => {
            if (text) editorRef.current?.insertText(text)
          })
          .catch((err: unknown) => {
            console.error('[clipboard] Paste as Plain Text failed:', err)
          })
        return
      }

      // Copy as Plain Text: the document's visible text (no markdown markers).
      if (cmd === 'eolLf') {
        useEditorStore.getState().setEol('lf')
        return
      }
      if (cmd === 'eolCrlf') {
        useEditorStore.getState().setEol('crlf')
        return
      }

      if (cmd === 'copyAsPlainText') {
        const text = editorRef.current?.getPlainText() ?? ''
        void window.lekha.writeClipboard({ text }).catch((err: unknown) => {
          console.error('[clipboard] Copy as Plain Text failed:', err)
        })
        return
      }

      // Copy without Theme Styling: rich HTML with no inlined CSS, so it adopts
      // the paste destination's styling.
      if (cmd === 'copyWithoutStyling') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        const { title } = useEditorStore.getState()
        void loadBuildExportHtml()
          .then((build) => build(markdown, { title, includeCss: false }))
          .then((html) => window.lekha.writeClipboard({ html, text: markdown }))
          .catch((err: unknown) => {
            console.error('[clipboard] Copy without Theme Styling failed:', err)
          })
        return
      }

      // ------------------------------------------------------------------
      // Copy as HTML
      //
      // Render the markdown to a standalone HTML document (same pipeline as
      // export) and write it to the clipboard as rich HTML, with the markdown
      // source as the plain-text fallback. The rich-HTML clipboard (via main
      // clipboard.write) lets pasting into rich editors keep formatting.
      // ------------------------------------------------------------------
      if (cmd === 'copyAsHtml') {
        const markdown = editorRef.current?.getMarkdown() ?? ''
        // A body FRAGMENT, not a full <!DOCTYPE html> document: a full doc on
        // the clipboard's HTML flavor is rejected by many rich-paste targets,
        // which then fall back to plain text. The HTML is also the plain-text
        // flavor so "Copy as HTML" yields HTML everywhere, never markdown.
        void loadRenderMarkdownBody()
          .then((render) => render(markdown))
          .then((html) => window.lekha.writeClipboard({ html, text: html }))
          .catch((err: unknown) => {
            console.error('[clipboard] Copy as HTML failed:', err)
          })
        return
      }

      // ------------------------------------------------------------------
      // Editor formatting, headings, lists, undo/redo, link, horizontalRule
      // All remaining AppCommands route to editorRef.runCommand which uses
      // editorCommandMap (single source of truth shared with keymap).
      // ------------------------------------------------------------------
      editorRef.current?.runCommand(cmd)
    // editorRef is a stable ref, so dispatch keeps a stable identity and the
    // subscription below never needs to re-register.
  }, [editorRef])

  useEffect(() => {
    // Subscribe and capture the unsubscribe function for cleanup.
    const unsubscribe = window.lekha.onCommand(dispatch)
    return unsubscribe
  }, [dispatch])

  return dispatch
}
