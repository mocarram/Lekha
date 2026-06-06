import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import {
  EditorPane,
  type EditorPaneHandle,
  type TableState,
} from '@renderer/editor/EditorPane'
import { useFileOps } from '@renderer/hooks/useFileOps'
import { useCommands } from '@renderer/hooks/useCommands'
import { useStartup } from '@renderer/hooks/useStartup'
import { useAutoSave } from '@renderer/hooks/useAutoSave'
import { useEditorStore } from '@renderer/store/editorStore'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { TitleBar } from '@renderer/components/TitleBar'
import { StatusBar } from '@renderer/components/StatusBar'
import { Sidebar } from '@renderer/components/Sidebar'
import { FindReplace } from '@renderer/components/FindReplace'
import { LinkDialog, type LinkDialogMode } from '@renderer/components/LinkDialog'
import { ImageDialog } from '@renderer/components/ImageDialog'
import { Preferences } from '@renderer/components/Preferences'
import { WordCountPanel } from '@renderer/components/WordCountPanel'
import { TableToolbar } from '@renderer/components/TableToolbar'
import { ImageZoom } from '@renderer/components/ImageZoom'
import { CommandPalette, type PaletteMode } from '@renderer/components/CommandPalette'
import { COMMANDS } from '@renderer/commands/registry'
import { flattenFiles } from '@renderer/commands/files'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import type { LinkInfo } from '@renderer/editor/EditorView'
import { applyTheme } from '@renderer/themes/index'

// ---------------------------------------------------------------------------
// Welcome document shown on first launch (no file open)
// ---------------------------------------------------------------------------

const WELCOME_MARKDOWN = `# Welcome to Lekha

Lekha is a WYSIWYG-style WYSIWYG Markdown editor.

## Getting started

- Open a file with **File > Open** or press \`Cmd+O\`
- Open a folder with **File > Open Folder** to browse your notes
- Toggle between **WYSIWYG** and **Source** view at any time

## Editing

Start typing to edit this document. Your changes are tracked automatically.

> Lekha renders Markdown as you write - no preview step needed.
`

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

/**
 * Compute outline and word/char counts from a markdown string and push the
 * results into the editor store. Shared by the mount effect (initial document)
 * and the debounced handler inside handleChange (subsequent edits).
 */
function recomputeDerived(markdown: string): void {
  const doc = parseMarkdown(markdown)
  useEditorStore.getState().setOutline(getOutline(doc))
  useEditorStore.getState().setCounts(countWords(doc))
}

export default function App() {
  const editorRef = useRef<EditorPaneHandle>(null)
  const fileOps = useFileOps(editorRef)

  // Restore persisted settings on mount and persist sidebar/folder changes.
  useStartup(fileOps)

  // Auto-save: debounced write for saved (has-path) dirty documents.
  const autoSave = useEditorStore((s) => s.autoSave)
  const isDirty = useEditorStore((s) => s.isDirty)
  const editorPath = useEditorStore((s) => s.path)
  // Wrap in an arrow to avoid the unbound-method lint rule: fileOps.save is a
  // plain async function (no `this` access), but the linter can't infer that.
  const autoSaveFn = useCallback(() => fileOps.save(), [fileOps])
  useAutoSave({ enabled: autoSave, isDirty, hasPath: editorPath !== null, save: autoSaveFn })

  // Find/Replace overlay state
  const [findState, setFindState] = useState<{
    open: boolean
    mode: 'find' | 'replace'
  }>({ open: false, mode: 'find' })

  // Link dialog state (insert / edit), controlled by App. `seq` increments on
  // each open and is used as the dialog's React `key` so it remounts fresh with
  // the new prefill (the dialog seeds its form state at mount).
  const [linkState, setLinkState] = useState<{
    open: boolean
    seq: number
    mode: LinkDialogMode
    initial: { text: string; href: string; title?: string }
  }>({ open: false, seq: 0, mode: 'insert', initial: { text: '', href: '' } })

  // Image dialog state.
  const [imageState, setImageState] = useState<{
    open: boolean
    seq: number
    initial: { src: string; alt: string }
  }>({ open: false, seq: 0, initial: { src: '', alt: '' } })

  // Preferences modal open/closed state.
  const [prefsOpen, setPrefsOpen] = useState(false)

  // Word-count panel open/closed state and the text snapshot it displays.
  // The text is captured from the live editor when the panel opens so the
  // stats reflect exactly what is on screen at that moment.
  const [statsState, setStatsState] = useState<{ open: boolean; text: string }>({
    open: false,
    text: '',
  })

  // Toggle the stats panel. When opening, snapshot the current markdown so the
  // panel computes stats from the live document; re-clicking the trigger closes.
  const toggleStatsPanel = useCallback(() => {
    setStatsState((prev) => {
      if (prev.open) return { open: false, text: '' }
      const text = editorRef.current?.getMarkdown() ?? ''
      return { open: true, text }
    })
  }, [])

  // Image zoom (lightbox) state: open/closed, current src and alt.
  const [imageZoomState, setImageZoomState] = useState<{
    open: boolean
    src: string
    alt: string
  }>({ open: false, src: '', alt: '' })

  // Open the lightbox when an image is clicked in the WYSIWYG editor.
  const openImageZoom = useCallback((src: string, alt: string) => {
    setImageZoomState({ open: true, src, alt })
  }, [])

  // Command palette / quick-open overlay state. One component, two modes.
  // `seq` increments on each open and is used as the React `key` so the palette
  // remounts fresh (empty query, selection at top) every time it appears.
  const [paletteState, setPaletteState] = useState<{
    open: boolean
    seq: number
    mode: PaletteMode
  }>({ open: false, seq: 0, mode: 'commands' })

  // Workspace file tree (for quick-open) + root, kept live from the store.
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)
  const paletteFiles = useMemo(
    () => flattenFiles(fileTree, rootFolder),
    [fileTree, rootFolder],
  )

  // Floating table toolbar state: shown while the cursor is inside a table,
  // anchored to the table's reported client rect. Updated on every selection
  // change via EditorPane's onTableStateChange.
  const [tableState, setTableState] = useState<TableState>({ inTable: false })

  // Open the link dialog from a click on a link in the editor (edit mode).
  const openLinkFromClick = useCallback((info: LinkInfo) => {
    setLinkState((prev) => ({
      open: true,
      seq: prev.seq + 1,
      mode: 'edit',
      initial: {
        text: info.text,
        href: info.href,
        ...(info.title ? { title: info.title } : {}),
      },
    }))
  }, [])

  // Wire native menu commands to editor / file ops / sidebar / find.
  // The hook returns its shared `dispatch` so the command palette can run any
  // command through the exact same routing path (no duplicated routing).
  const dispatch = useCommands(editorRef, fileOps, {
    onFind: () => { setFindState({ open: true, mode: 'find' }) },
    onReplace: () => { setFindState({ open: true, mode: 'replace' }) },
    onLink: (request) => {
      setLinkState((prev) => ({
        open: true,
        seq: prev.seq + 1,
        mode: request.mode,
        initial: request.initial,
      }))
    },
    onInsertImage: () => {
      setImageState((prev) => ({
        open: true,
        seq: prev.seq + 1,
        initial: { src: '', alt: '' },
      }))
    },
    onPreferences: () => { setPrefsOpen(true) },
    onCommandPalette: () => {
      setPaletteState((prev) => ({ open: true, seq: prev.seq + 1, mode: 'commands' }))
    },
    onQuickOpen: () => {
      setPaletteState((prev) => ({ open: true, seq: prev.seq + 1, mode: 'files' }))
    },
  })

  // Subscribe to Open Recent path messages from the main process.
  // The main menu sends IPC.openPath with a full file path; we route it
  // through the same openPath() handler as any other file open.
  useEffect(() => {
    if (typeof window.lekha === 'undefined') return undefined
    const unsubscribe = window.lekha.onOpenPath((path) => {
      void fileOps.openPath(path)
    })
    return unsubscribe
  }, [fileOps])

  // Subscribe to set-theme messages from the main process (Theme menu).
  //
  // Flow: user picks a theme in the native menu -> main sends IPC.setTheme ->
  // this handler (1) applies the CSS token switch immediately via applyTheme,
  // (2) persists the choice via setSettings so it survives restart, and
  // (3) calls window.lekha.setSettings which returns the full updated settings;
  // main rebuilds the menu on each setSettings call (see registerFileHandlers)
  // so the radio check updates automatically - no extra IPC hop needed.
  useEffect(() => {
    if (typeof window.lekha === 'undefined') return undefined
    const unsubscribe = window.lekha.onSetTheme((id: string) => {
      applyTheme(id)
      void window.lekha.setSettings({ theme: id })
    })
    return unsubscribe
  }, [])

  // Debounce timer ref - used to delay outline/count recomputation so we
  // don't parse on every keystroke. Cleared on unmount to avoid a setState
  // call on an already-unmounted component.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Seed store from the initial document on mount (runs once).
  // Without this the status bar shows "0 words · 0 chars" until the user edits,
  // because handleChange (onChange) never fires for the pre-loaded welcome doc.
  useEffect(() => {
    useEditorStore.getState().setMarkdown(WELCOME_MARKDOWN)
    recomputeDerived(WELCOME_MARKDOWN)
  }, [])

  // Cleanup: clear any pending debounce timer on unmount.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  const handleChange = useCallback((markdown: string) => {
    // 1. Update store markdown and mark dirty immediately.
    const store = useEditorStore.getState()
    store.setMarkdown(markdown)
    store.markDirty()

    // 2. Sync the OS window title-bar dirty state if the bridge is available.
    if (typeof window.lekha !== 'undefined') {
      const { title, path } = store
      window.lekha.setDocumentState({ title, dirty: true, path })
    }

    // 3. Debounce the heavier parse + outline/count recomputation (~150ms).
    //    Cancels any pending timer so rapid keystrokes only trigger one parse.
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      recomputeDerived(markdown)
    }, 150)
  }, [])

  const handleToggleSource = useCallback(() => {
    // toggleMode() returns the NEW mode synchronously so we can update the
    // store without a stale read (React state hasn't re-rendered yet at this
    // point, so editorRef.current.getMode() would return the OLD mode).
    const next = editorRef.current?.toggleMode()
    if (next !== undefined) {
      useEditorStore.getState().setMode(next)
    }
  }, [])

  return (
    <div className="app">
      <TitleBar />

      <div className="workspace">
        <Sidebar
          onSelectFile={(path) => { void fileOps.openPath(path) }}
          onJumpToHeading={(pos) => { editorRef.current?.scrollToPos(pos) }}
          onOpenSearchResult={(filePath, query, caseSensitive) => {
            // Open-then-find: open the file, then use the in-document find to
            // highlight and navigate to the query. Line-to-position mapping in
            // WYSIWYG is unreliable; reusing the editor's own find is robust.
            void fileOps.openPath(filePath).then(() => {
              editorRef.current?.setFind(query, { caseSensitive })
              editorRef.current?.findNext()
            })
          }}
        />

        <EditorPane
          ref={editorRef}
          initialMarkdown={WELCOME_MARKDOWN}
          onChange={handleChange}
          onLinkClick={openLinkFromClick}
          onImageClick={openImageZoom}
          onTableStateChange={setTableState}
          onInsertImage={() => dispatch('insertImage')}
          className="editor-pane"
        />
      </div>

      <StatusBar onToggleSource={handleToggleSource} onShowStats={toggleStatsPanel} />

      <FindReplace
        open={findState.open}
        mode={findState.mode}
        editorRef={editorRef}
        onClose={() => setFindState((prev) => ({ ...prev, open: false }))}
      />

      <LinkDialog
        key={`link-${linkState.seq}`}
        open={linkState.open}
        mode={linkState.mode}
        initial={linkState.initial}
        onSubmit={({ text, href, title }) => {
          editorRef.current?.applyLink({ href, text, ...(title ? { title } : {}) })
          setLinkState((prev) => ({ ...prev, open: false }))
        }}
        onRemove={() => {
          editorRef.current?.removeLink()
          setLinkState((prev) => ({ ...prev, open: false }))
        }}
        onOpenUrl={(url) => { void window.lekha.openExternal(url) }}
        onClose={() => setLinkState((prev) => ({ ...prev, open: false }))}
      />

      <ImageDialog
        key={`image-${imageState.seq}`}
        open={imageState.open}
        initial={imageState.initial}
        onSubmit={({ src, alt }) => {
          editorRef.current?.insertImage({ src, ...(alt ? { alt } : {}) })
          setImageState((prev) => ({ ...prev, open: false }))
        }}
        onClose={() => setImageState((prev) => ({ ...prev, open: false }))}
      />

      <Preferences open={prefsOpen} onClose={() => setPrefsOpen(false)} />

      <WordCountPanel
        open={statsState.open}
        text={statsState.text}
        onClose={() => setStatsState({ open: false, text: '' })}
      />

      <ImageZoom
        open={imageZoomState.open}
        src={imageZoomState.src}
        alt={imageZoomState.alt}
        onClose={() => setImageZoomState((prev) => ({ ...prev, open: false }))}
      />

      <CommandPalette
        key={`palette-${paletteState.seq}`}
        open={paletteState.open}
        mode={paletteState.mode}
        commands={COMMANDS}
        files={paletteFiles}
        hasFolder={rootFolder !== null}
        onRun={(id) => {
          // Close first, then run through the shared dispatch so a command
          // that opens another overlay (e.g. Find) is not immediately hidden.
          setPaletteState((prev) => ({ ...prev, open: false }))
          dispatch(id)
        }}
        onOpenFile={(path) => {
          setPaletteState((prev) => ({ ...prev, open: false }))
          void fileOps.openPath(path)
        }}
        onClose={() => setPaletteState((prev) => ({ ...prev, open: false }))}
      />

      {tableState.inTable && tableState.rect ? (
        <TableToolbar
          show
          rect={tableState.rect}
          onCommand={(cmd) => {
            editorRef.current?.runTableCommand(cmd)
            // The command re-focuses the editor; refresh the toolbar position
            // since row/column edits change the table's geometry.
            const next = editorRef.current?.getTableState()
            if (next) setTableState(next)
          }}
        />
      ) : null}
    </div>
  )
}
