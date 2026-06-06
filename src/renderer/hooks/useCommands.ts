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
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'
import type { AppCommand } from '@shared/commands'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useEditorStore } from '@renderer/store/editorStore'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'
import type { FileOps } from './useFileOps'
import { buildExportHtml } from '@renderer/export/buildHtml'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload passed to onLink describing how the link dialog should open. */
export interface LinkDialogRequest {
  mode: 'insert' | 'edit'
  initial: { text: string; href: string; title?: string }
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
 */
export function useCommands(
  editorRef: RefObject<EditorPaneHandle | null>,
  fileOps: FileOps,
  opts: CommandOpts,
): void {
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

  useEffect(() => {
    const dispatch = (cmd: AppCommand): void => {
      const fo = fileOpsRef.current
      const o = optsRef.current
      // ------------------------------------------------------------------
      // File operations
      // ------------------------------------------------------------------
      if (cmd === 'new') {
        void fo.newFile()
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

      // ------------------------------------------------------------------
      // Sidebar toggle (workspace store)
      // ------------------------------------------------------------------
      if (cmd === 'toggleSidebar') {
        useWorkspaceStore.getState().toggleSidebar()
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

      // ------------------------------------------------------------------
      // Editor formatting, headings, lists, undo/redo, link, horizontalRule
      // All remaining AppCommands route to editorRef.runCommand which uses
      // editorCommandMap (single source of truth shared with keymap).
      // ------------------------------------------------------------------
      editorRef.current?.runCommand(cmd)
    }

    // Subscribe and capture the unsubscribe function for cleanup.
    const unsubscribe = window.lekha.onCommand(dispatch)
    return unsubscribe
    // Empty deps: subscribe once. fileOpsRef / optsRef / editorRef are React
    // refs and always hold the latest values without needing re-subscription.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
