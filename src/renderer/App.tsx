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
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { TitleBar } from '@renderer/components/TitleBar'
import { StatusBar } from '@renderer/components/StatusBar'
import { TabBar } from '@renderer/components/TabBar'
import { Sidebar } from '@renderer/components/Sidebar'
import { FindReplace } from '@renderer/components/FindReplace'
import { LinkDialog, type LinkDialogMode } from '@renderer/components/LinkDialog'
import { ImageDialog } from '@renderer/components/ImageDialog'
import { RenameDialog } from '@renderer/components/RenameDialog'
import { GetInfoDialog, type GetInfoData } from '@renderer/components/GetInfoDialog'
import { Preferences } from '@renderer/components/Preferences'
import { WordCountPanel } from '@renderer/components/WordCountPanel'
import { TableToolbar } from '@renderer/components/TableToolbar'
import { ImageZoom } from '@renderer/components/ImageZoom'
import { CommandPalette, type PaletteMode } from '@renderer/components/CommandPalette'
import { Presentation } from '@renderer/components/Presentation'
import { TemplatePicker } from '@renderer/components/TemplatePicker'
import { splitSlides } from '@renderer/presentation/slides'
import { COMMANDS } from '@renderer/commands/registry'
import { BUILTIN_TEMPLATES } from '@renderer/templates/registry'
import type { Template } from '@shared/types'
import { applyTemplate } from '@renderer/templates/applyTemplate'
import { flattenFiles } from '@renderer/commands/files'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import type { LinkInfo } from '@renderer/editor/EditorView'
import { applyTheme } from '@renderer/themes/index'
import { SIDEBAR_DEFAULT_WIDTH } from '@renderer/components/sidebarResizerUtils'

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
function recomputeDerived(doc: ProseMirrorNode): void {
  useEditorStore.getState().setOutline(getOutline(doc))
  useEditorStore.getState().setCounts(countWords(doc))
}

export default function App() {
  const editorRef = useRef<EditorPaneHandle>(null)
  const fileOps = useFileOps(editorRef)

  // Sidebar width: restored from settings on startup, updated live via drag.
  // Declared before useStartup so the setter can be passed to the hook.
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH)

  // Restore persisted settings on mount and persist sidebar/folder changes.
  // The second argument receives the restored sidebarWidth so the React state
  // is kept in sync with the CSS variable applied by useStartup.
  useStartup(fileOps, setSidebarWidth)

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

  // Rename dialog state (renaming the current document). `seq` bumps on each
  // open so the dialog remounts and re-seeds the input with the current name.
  const [renameState, setRenameState] = useState<{
    open: boolean
    seq: number
    initial: string
  }>({ open: false, seq: 0, initial: '' })

  // Get Info dialog: App resolves the file stat (in the command handler, not an
  // effect) and stores the snapshot the dialog renders.
  const [getInfoData, setGetInfoData] = useState<GetInfoData | null>(null)

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

  // Presentation overlay state: open/closed + the pre-split slides for the
  // document snapshot captured at the moment the overlay opens. `seq` increments
  // on each open, used as the React `key` so the component remounts fresh with
  // the new slides (avoids the need for internal derived-state resets).
  const [presState, setPresState] = useState<{
    open: boolean
    seq: number
    slides: string[]
  }>({ open: false, seq: 0, slides: [] })

  // Template picker state: open/closed, seq (for remount), and merged template list.
  // User templates are loaded via IPC when the picker opens.
  const [templateState, setTemplateState] = useState<{
    open: boolean
    seq: number
    templates: Template[]
  }>({ open: false, seq: 0, templates: [] })

  // Workspace file tree (for quick-open) + root, kept live from the store.
  const fileTree = useWorkspaceStore((s) => s.fileTree)
  const rootFolder = useWorkspaceStore((s) => s.rootFolder)
  const showStatusBar = useWorkspaceStore((s) => s.showStatusBar)
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
    onRename: () => {
      const path = useEditorStore.getState().path
      if (path === null) return
      const base = path.split('/').pop() ?? ''
      setRenameState((prev) => ({ open: true, seq: prev.seq + 1, initial: base }))
    },
    onGetInfo: () => {
      const { path, wordCount, charCount } = useEditorStore.getState()
      if (path === null) return
      void window.lekha
        .statFile(path)
        .then((stat) => {
          setGetInfoData({
            path,
            sizeBytes: stat.sizeBytes,
            birthtimeMs: stat.birthtimeMs,
            mtimeMs: stat.mtimeMs,
            words: wordCount,
            chars: charCount,
          })
        })
        .catch((err: unknown) => {
          window.alert(err instanceof Error ? err.message : String(err))
        })
    },
    onCommandPalette: () => {
      setPaletteState((prev) => ({ open: true, seq: prev.seq + 1, mode: 'commands' }))
    },
    onQuickOpen: () => {
      setPaletteState((prev) => ({ open: true, seq: prev.seq + 1, mode: 'files' }))
    },
    onPresentation: () => {
      // Snapshot the current markdown and split into slides when the overlay opens.
      const markdown = editorRef.current?.getMarkdown() ?? ''
      const slides = splitSlides(markdown)
      setPresState((prev) => ({ open: true, seq: prev.seq + 1, slides }))
    },
    onNewFromTemplate: () => {
      // Load user templates from IPC and merge with built-ins when the picker opens.
      // Falls back to built-ins only if the IPC is unavailable (e.g. in tests).
      const loadAndOpen = async (): Promise<void> => {
        let userTemplates: Template[] = []
        if (typeof window.lekha !== 'undefined') {
          try {
            userTemplates = await window.lekha.listTemplates()
          } catch {
            // If the directory is missing or the IPC fails, proceed with built-ins.
            userTemplates = []
          }
        }
        const allTemplates = [...BUILTIN_TEMPLATES, ...userTemplates]
        setTemplateState((prev) => ({ open: true, seq: prev.seq + 1, templates: allTemplates }))
      }
      void loadAndOpen()
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
    recomputeDerived(parseMarkdown(WELCOME_MARKDOWN))
    // Seed the tab session with the initial document so there is always exactly
    // one active tab matching editorStore (the TabBar stays hidden at one tab).
    const docs = useDocumentsStore.getState()
    if (docs.documents.length === 0) {
      docs.openDocument({ path: null, markdown: WELCOME_MARKDOWN })
    }
  }, [])

  // Cleanup: clear any pending debounce timer on unmount.
  useEffect(() => () => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
  }, [])

  const handleChange = useCallback((markdown: string, doc?: ProseMirrorNode) => {
    // 1. Update store markdown and mark dirty immediately.
    const store = useEditorStore.getState()
    store.setMarkdown(markdown)
    store.markDirty()

    // 1b. Flip the active tab's dirty flag ONLY on the clean->dirty transition.
    //     We intentionally do NOT mirror `markdown` into the tab on every
    //     keystroke: that churns the documents array identity and re-renders the
    //     TabBar on every key press. The tab's markdown snapshot is captured
    //     lazily from the live editor at the moments it matters - switching tabs
    //     (snapshotActive), saving (persist), and closing - so it stays correct
    //     without per-keystroke array mutations.
    const docs = useDocumentsStore.getState()
    const active = docs.activeDocument()
    if (active !== null && !active.isDirty) {
      docs.updateActive({ isDirty: true })
    }

    // 2. Sync the OS window title-bar dirty state if the bridge is available.
    if (typeof window.lekha !== 'undefined') {
      const { title, path } = store
      window.lekha.setDocumentState({ title, dirty: true, path })
    }

    // 3. Debounce the outline/word-count recomputation (~150ms). In WYSIWYG mode
    //    the live ProseMirror `doc` is passed through, so we derive directly from
    //    it (no re-parse). In source mode no doc is available, so we parse the
    //    markdown string once per debounce window. PM nodes are immutable, so
    //    capturing `doc` across the timer is safe.
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      recomputeDerived(doc ?? parseMarkdown(markdown))
    }, 150)
  }, [])

  // -------------------------------------------------------------------------
  // File-tree operations (create / rename / delete / reveal)
  //
  // Each mutating op goes through window.lekha then refreshes the tree so the
  // sidebar reflects the on-disk state. New entries get a default name (the
  // user renames via the context menu). Delete uses the main-process
  // shell.trashItem (recoverable) and is gated behind a light confirm.
  // -------------------------------------------------------------------------

  // Resolve the directory a new entry is created in: the right-clicked folder,
  // or the workspace root when invoked from the empty/root area.
  const resolveDir = useCallback((dir: string | null): string | null => {
    return dir ?? useWorkspaceStore.getState().rootFolder
  }, [])

  const handleNewFile = useCallback(async (dir: string | null) => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      const path = await window.lekha.createFile(target, 'Untitled.md')
      await fileOps.refreshTree()
      // Open the freshly created (empty) file so the user can start typing.
      await fileOps.openPath(path)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [fileOps, resolveDir])

  const handleNewFolder = useCallback(async (dir: string | null) => {
    const target = resolveDir(dir)
    if (target === null) return
    try {
      await window.lekha.createFolder(target, 'Untitled Folder')
      await fileOps.refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [fileOps, resolveDir])

  const handleRenameEntry = useCallback(async (oldPath: string, newName: string) => {
    try {
      const newPath = await window.lekha.renamePath(oldPath, newName)
      // Update EVERY open tab whose path matches (or sits under) the renamed
      // entry so no tab keeps a stale on-disk path.
      useDocumentsStore.getState().updatePath(oldPath, newPath)
      // If the renamed entry is the active document, also update the editor's
      // live path so saves keep targeting the right file.
      if (useEditorStore.getState().path === oldPath) {
        useEditorStore.getState().setPath(newPath)
        const { title } = useEditorStore.getState()
        window.lekha.setDocumentState({
          title,
          dirty: useEditorStore.getState().isDirty,
          path: newPath,
        })
      }
      await fileOps.refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [fileOps])

  const handleDeleteEntry = useCallback(async (path: string) => {
    // Confirm before trashing. trashItem is recoverable (OS trash), but a
    // confirm avoids accidental one-click deletes.
    if (!window.confirm('Move this item to the Trash?')) return
    try {
      await window.lekha.deletePath(path)
      // If the open document was deleted - directly, or because a folder
      // containing it was trashed - clear its path so a later save uses Save As
      // rather than rewriting the trashed location. The buffer is kept.
      const openPath = useEditorStore.getState().path
      if (openPath !== null && (openPath === path || openPath.startsWith(path + '/'))) {
        useEditorStore.getState().setPath(null)
      }
      await fileOps.refreshTree()
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }, [fileOps])

  const handleRevealEntry = useCallback((path: string) => {
    void window.lekha.revealPath(path)
  }, [])

  // Handle template selection from the TemplatePicker.
  // guardUnsaved runs here (not in the picker) so the document is never
  // discarded without confirmation. On confirmation: clear to a new file,
  // set the template content (with {{date}} substituted), then close the picker.
  const handleTemplateSelect = useCallback(async (template: Template) => {
    // guardUnsaved is embedded in newFile(); however, we need the content
    // injected AFTER newFile clears the editor. We call guardUnsaved directly
    // so we can inject markdown before newFile clears it, and avoid a double prompt.
    //
    // Flow:
    //   1. guardUnsaved() - abort if user cancels
    //   2. Clear + new-file state (mirroring newFile() internals)
    //   3. Set the template content with date substitution
    if (!(await fileOps.guardUnsaved())) return

    // Clear editor and reset store (same as newFile() but without its own guard).
    editorRef.current?.setMarkdown('')
    useEditorStore.getState().newFile()
    if (typeof window.lekha !== 'undefined') {
      window.lekha.setDocumentState({ title: 'Untitled', dirty: false, path: null })
    }

    // Inject template content (date substituted at insertion time).
    const content = applyTemplate(template.content, new Date())
    editorRef.current?.setMarkdown(content)

    // Mark dirty so an immediate Cmd+S triggers Save As rather than silently
    // dropping the content. The editor's onChange will fire and handle the rest.
    useEditorStore.getState().setMarkdown(content)
    useEditorStore.getState().markDirty()
    if (typeof window.lekha !== 'undefined') {
      const { title, path } = useEditorStore.getState()
      window.lekha.setDocumentState({ title, dirty: true, path })
    }

    setTemplateState((prev) => ({ ...prev, open: false }))
  }, [fileOps, editorRef])

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
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRenameEntry={handleRenameEntry}
          onDeleteEntry={handleDeleteEntry}
          onRevealEntry={handleRevealEntry}
          sidebarWidth={sidebarWidth}
          onSidebarWidthChange={setSidebarWidth}
        />

        <div className="editor-area">
          <TabBar
            onSelect={(id) => { void fileOps.selectTab(id) }}
            onClose={(id) => { void fileOps.closeTab(id) }}
            onNew={() => { void fileOps.newFile() }}
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
      </div>

      {showStatusBar && (
        <StatusBar onToggleSource={handleToggleSource} onShowStats={toggleStatsPanel} />
      )}

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

      <GetInfoDialog
        open={getInfoData !== null}
        data={getInfoData}
        onClose={() => setGetInfoData(null)}
      />

      <RenameDialog
        key={`rename-${renameState.seq}`}
        open={renameState.open}
        initial={renameState.initial}
        onClose={() => setRenameState((prev) => ({ ...prev, open: false }))}
        onSubmit={(newName) => {
          setRenameState((prev) => ({ ...prev, open: false }))
          const path = useEditorStore.getState().path
          if (path !== null) void handleRenameEntry(path, newName)
        }}
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

      <Presentation
        key={`presentation-${presState.seq}`}
        open={presState.open}
        slides={presState.slides}
        onExit={() => {
          setPresState((prev) => ({ ...prev, open: false }))
          // Restore focus to the editor after exiting the presentation.
          editorRef.current?.focus()
        }}
      />

      <TemplatePicker
        key={`template-${templateState.seq}`}
        open={templateState.open}
        templates={templateState.templates}
        onSelect={(template) => { void handleTemplateSelect(template) }}
        onClose={() => setTemplateState((prev) => ({ ...prev, open: false }))}
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
