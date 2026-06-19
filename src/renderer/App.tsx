import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import {
  EditorPane,
  type EditorPaneHandle,
  type TableState,
} from '@renderer/editor/EditorPane'
import { useFileOps } from '@renderer/hooks/useFileOps'
import { useCommands } from '@renderer/hooks/useCommands'
import { useStartup } from '@renderer/hooks/useStartup'
import { applyWindowColor } from '@renderer/windowColor'
import { useAutoSave } from '@renderer/hooks/useAutoSave'
import { useCrashBackup } from '@renderer/hooks/useCrashBackup'
import { applyAutoSave } from '@renderer/hooks/applyAutoSave'
import { useEditorStore } from '@renderer/store/editorStore'
import { parseMarkdown } from '@renderer/editor/parser'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { StatusBar } from '@renderer/components/StatusBar'
import { TabBar } from '@renderer/components/TabBar'
import { EmptyState } from '@renderer/components/EmptyState'
import { Sidebar } from '@renderer/components/Sidebar'
import { SearchFindSync } from '@renderer/components/SearchFindSync'
import { SidebarToggle } from '@renderer/components/SidebarToggle'
import { EditorDropZone } from '@renderer/components/EditorDropZone'
import { FindReplace } from '@renderer/components/FindReplace'
import { LinkDialog, type LinkDialogMode } from '@renderer/components/LinkDialog'
import { ImageDialog } from '@renderer/components/ImageDialog'
import { RenameDialog } from '@renderer/components/RenameDialog'
import { GetInfoDialog, type GetInfoData } from '@renderer/components/GetInfoDialog'
import { Preferences } from '@renderer/components/Preferences'
import { RecoveryNotice } from '@renderer/components/RecoveryNotice'
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

Lekha is a clean, distraction-free WYSIWYG Markdown editor.

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

  // Transient toast for brief drag-and-drop feedback (auto-dismisses).
  const [dropToast, setDropToast] = useState<string | null>(null)
  const dropToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notifyDrop = useCallback((message: string) => {
    setDropToast(message)
    if (dropToastTimer.current !== null) clearTimeout(dropToastTimer.current)
    dropToastTimer.current = setTimeout(() => setDropToast(null), 3000)
  }, [])
  // Clear any pending toast timer on unmount so it never fires afterwards.
  useEffect(() => () => {
    if (dropToastTimer.current !== null) clearTimeout(dropToastTimer.current)
  }, [])

  // Restore persisted settings on mount and persist sidebar/folder changes.
  // The second argument receives the restored sidebarWidth so the React state
  // is kept in sync with the CSS variable applied by useStartup.
  useStartup(fileOps, editorRef, setSidebarWidth)

  // Auto-save: debounced write for saved (has-path) dirty documents.
  // Declared here (not with the focus-check block below) because auto-save
  // reuses the same non-blocking notice banner for external-edit conflicts.
  const [externalNotice, setExternalNotice] = useState<string | null>(null)
  const autoSave = useEditorStore((s) => s.autoSave)
  const isDirty = useEditorStore((s) => s.isDirty)
  const editorPath = useEditorStore((s) => s.path)
  // saveQuiet (not save): auto-save must never pop a modal mid-typing. On an
  // external-edit conflict it skips the write and raises the notice banner.
  // Wrapped in an arrow to dodge the unbound-method lint rule.
  const autoSaveFn = useCallback(() => fileOps.saveQuiet(setExternalNotice), [fileOps])
  useAutoSave({ enabled: autoSave, isDirty, hasPath: editorPath !== null, save: autoSaveFn })

  // Shared auto-save toggle behaviour: the same path for the native menu item
  // and the Preferences checkbox (immediate flush on enable lives in the helper).
  // fileOps.save is wrapped in an arrow to dodge the unbound-method lint rule.
  const handleApplyAutoSave = useCallback(
    (next: boolean) => { applyAutoSave(next, () => fileOps.save()) },
    [fileOps],
  )

  // Crash recovery: always-on debounced backup of unsaved buffers (independent
  // of the auto-save setting). Covers Untitled docs too.
  useCrashBackup(editorRef)

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
  // This window's marker color; an effect mirrors it to the --window-color CSS
  // var (the top color rail). Single writer = the effect (applyWindowColor).
  const windowColor = useWorkspaceStore((s) => s.windowColor)
  // Whether the sidebar panel is shown. When hidden the content column becomes
  // the leftmost panel, so the shell must reserve traffic-light space on the tab
  // strip and re-anchor the word-count popover (both handled in CSS via the
  // `app--sidebar-hidden` modifier below).
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  // Number of open documents; drives the editor empty state (zero tabs).
  const documentCount = useDocumentsStore((s) => s.documents.length)
  const paletteFiles = useMemo(
    () => flattenFiles(fileTree, rootFolder),
    [fileTree, rootFolder],
  )

  // Floating table toolbar state: shown while the cursor is inside a table,
  // anchored to the table's reported client rect. Updated on every selection
  // change via EditorPane's onTableStateChange.
  const [tableState, setTableState] = useState<TableState>({ inTable: false })

  // Mirror the window marker color to the --window-color CSS var (the top
  // rail). Runs on every change incl. the initial null, so the rail appears /
  // disappears as the color is set, cleared, or restored on folder open.
  useEffect(() => {
    applyWindowColor(windowColor)
  }, [windowColor])

  // Set or clear this window's marker color: update the store (the effect
  // paints the rail) and, when a folder is open, persist it under that folder
  // so reopening the project anywhere restores the color. A folderless window's
  // color stays ephemeral.
  const handleSetWindowColor = useCallback((hex: string | null): void => {
    useWorkspaceStore.getState().setWindowColor(hex)
    const folder = useWorkspaceStore.getState().rootFolder
    if (folder !== null && typeof window.lekha !== 'undefined') {
      void window.lekha.setFolderColor(folder, hex)
    }
  }, [])

  // Keep the floating table toolbar glued to the table while editing: the rect
  // is reported on selection/doc changes, but NOT on scroll/resize, so without
  // this the toolbar drifts away from the table when the editor scrolls. While
  // the caret is in a table, re-read the table's rect on editor-pane scroll and
  // window resize (rAF-throttled) and refresh the anchor.
  useEffect(() => {
    if (!tableState.inTable) return undefined
    const pane = document.querySelector('.editor-pane')
    if (!pane) return undefined
    let raf = 0
    const reposition = (): void => {
      raf = 0
      const next = editorRef.current?.getTableState()
      if (next) setTableState(next)
    }
    const schedule = (): void => {
      if (raf === 0) raf = requestAnimationFrame(reposition)
    }
    pane.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (raf !== 0) cancelAnimationFrame(raf)
      pane.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [tableState.inTable])

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

  // Subscribe to set-auto-save messages from the main process (File menu).
  //
  // Flow: user toggles "Auto Save" in the native menu -> main sends
  // IPC.setAutoSave with the new value -> this handler routes through the same
  // applyAutoSave behaviour as the Preferences checkbox (store + persist +
  // immediate flush on enable). Persisting via setSettings triggers a menu
  // rebuild in main so the check mark stays current.
  useEffect(() => {
    if (typeof window.lekha === 'undefined') return undefined
    const unsubscribe = window.lekha.onSetAutoSave((next: boolean) => {
      handleApplyAutoSave(next)
    })
    return unsubscribe
  }, [handleApplyAutoSave])

  // Push window-level dirtiness (ANY open tab dirty) to main so the close guard
  // and the macOS edited dot are window-level, not active-doc-level. A clean
  // active tab with a dirty BACKGROUND tab must still prompt on close. Subscribe
  // to BOTH stores (the live editor's isDirty and the per-tab snapshots), and
  // only send when the computed value changes (ref-tracked) to avoid redundant
  // IPC. Mount-only: refs/stores are stable, so this never re-subscribes.
  const lastAnyDirty = useRef<boolean | null>(null)
  useEffect(() => {
    if (typeof window.lekha === 'undefined') return undefined
    const computeAnyDirty = (): boolean => {
      const ed = useEditorStore.getState()
      const ds = useDocumentsStore.getState()
      // active live dirty OR any OTHER tab dirty
      return ed.isDirty || ds.documents.some((d) => d.id !== ds.activeId && d.isDirty)
    }
    const maybePush = (): void => {
      const v = computeAnyDirty()
      if (v === lastAnyDirty.current) return
      lastAnyDirty.current = v
      window.lekha.setWindowDirty(v)
    }
    // Push once on mount so main starts from the correct state.
    maybePush()
    const unsubEditor = useEditorStore.subscribe(maybePush)
    const unsubDocuments = useDocumentsStore.subscribe(maybePush)
    return () => {
      unsubEditor()
      unsubDocuments()
    }
  }, [])

  // Debounce timer ref - used to delay outline/count recomputation so we
  // don't parse on every keystroke. Cleared on unmount to avoid a setState
  // call on an already-unmounted component.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // -------------------------------------------------------------------------
  // External-change detection (lazy, watcher-free).
  //
  // When the window regains focus (i.e. the user returns from Finder), do ONE
  // cheap stat of the active document's path. A same-folder rename is recovered
  // silently (the tab follows the new name via its inode); a move-elsewhere or
  // delete keeps the buffer but detaches the doc from disk and shows a quiet,
  // non-blocking notice. No fs watchers, no polling, nothing on the typing path.
  // (externalNotice state is declared with the auto-save block above, which
  // shares the banner.)
  // -------------------------------------------------------------------------
  // The file-system side of the external-change check lives in useFileOps
  // (verifyActiveDoc); App only owns the banner UI. Passing setExternalNotice as
  // the notice callback keeps the banner behaviour identical while the stat /
  // detach / rename-recovery logic stays in the file-ops hook.
  useEffect(() => {
    const onFocus = (): void => { void fileOps.verifyActiveDoc(setExternalNotice) }
    window.addEventListener('focus', onFocus)
    return () => { window.removeEventListener('focus', onFocus) }
  }, [fileOps])

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
    // Editing dismisses any stale external-change notice.
    setExternalNotice(null)

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
    // Stamp the schedule with the tab that is active right now. A pending
    // recompute from the OLD tab must NOT overwrite the NEW tab's outline/counts
    // after a tab switch (selectTab/closeTab -> loadTab recomputes synchronously
    // for the new tab). When the timer fires we drop its result if the active
    // tab has since changed, so stale derived data never clobbers the new tab.
    const scheduledForId = useDocumentsStore.getState().activeId
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null
      if (useDocumentsStore.getState().activeId !== scheduledForId) return
      recomputeDerived(doc ?? parseMarkdown(markdown))
    }, 150)
  }, [])

  // File-tree operations (create / rename / delete / reveal) and the external-
  // change check now live in useFileOps; App just routes the Sidebar callbacks
  // and the RenameDialog submit through the fileOps object.

  // Handle template selection from the TemplatePicker.
  // guardUnsaved runs here (not in the picker) so the document is never
  // discarded without confirmation. On confirmation: clear to a new file,
  // set the template content (with {{date}} substituted), then close the picker.
  const handleTemplateSelect = useCallback(async (template: Template) => {
    // guardUnsaved is embedded in newFile(); however, we need the content
    // injected AFTER the editor is cleared. We call guardUnsaved directly so we
    // can inject markdown before clearing it, and avoid a double prompt.
    //
    // Flow:
    //   1. guardUnsaved() - abort if user cancels
    //   2. resetToBlank() - clear + new-file state (guard-less, no tab churn)
    //   3. Set the template content with date substitution
    if (!(await fileOps.guardUnsaved())) return

    // Clear editor and reset store (newFile()'s internals without its guard or
    // tab bookkeeping), via the shared file-ops helper.
    fileOps.resetToBlank()

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

  // After a folder-wide replace, reload any CHANGED file open in a CLEAN tab so
  // the on-disk change and the in-app buffer never diverge. Dirty tabs were
  // skipped by the replace and are intentionally left alone.
  const refreshDiskSig = fileOps.refreshDiskSig
  const handleFolderReplaced = useCallback((changedPaths: string[]) => {
    const changed = new Set(changedPaths)
    const docs = useDocumentsStore.getState()
    for (const doc of docs.documents) {
      if (doc.path === null || doc.isDirty || !changed.has(doc.path)) continue
      const docId = doc.id
      const docPath = doc.path
      void window.lekha.readFile(docPath).then((content) => {
        // Re-check dirtiness AFTER the async read: the user may have started
        // editing this tab during the IPC round-trip. If so, leave their
        // unsaved edits alone rather than clobbering them with disk content.
        const current = useDocumentsStore.getState().documents.find((d) => d.id === docId)
        if (!current || current.isDirty) return
        if (docId === useDocumentsStore.getState().activeId) {
          if (useEditorStore.getState().isDirty) return
          editorRef.current?.setMarkdown(content)
          useEditorStore.getState().setMarkdown(content)
        }
        useDocumentsStore.getState().updateDocument(docId, { markdown: content, isDirty: false })
        // The replace bumped the file's mtime; adopt the reloaded content as the
        // external-change baseline so the next Save does not falsely prompt.
        void refreshDiskSig(docPath)
      })
    }
  }, [refreshDiskSig])

  return (
    <div className={`app${sidebarVisible ? '' : ' app--sidebar-hidden'}`}>
      {/* Render-free: tracks the live folder-search query (which changes per
          keystroke) without re-rendering the App tree. */}
      <SearchFindSync editorRef={editorRef} />
      <Sidebar
        onSelectFile={(path) => { void fileOps.openPath(path) }}
        onJumpToHeading={(pos) => { editorRef.current?.scrollToPos(pos) }}
        onReplaced={handleFolderReplaced}
        onOpenSearchResult={(filePath, query, caseSensitive, wholeWord, occurrence) => {
          // Open-then-find: open the file, then use the in-document find to
          // highlight and navigate to the query. Line-to-position mapping in
          // WYSIWYG is unreliable; reusing the editor's own find is robust.
          // Pass wholeWord so highlights match the search semantics (no partial
          // hits), and gotoMatch(occurrence) lands on the clicked line's match
          // rather than always the first (setFind already selects match 0, so a
          // bare findNext() would wrongly skip to the second match).
          void fileOps.openPath(filePath).then(() => {
            editorRef.current?.setFind(query, { caseSensitive, wholeWord })
            editorRef.current?.gotoMatch(occurrence)
          })
        }}
        onNewFile={(dir) => { void fileOps.createFileEntry(dir) }}
        onNewFolder={(dir) => { void fileOps.createFolderEntry(dir) }}
        onRenameEntry={(oldPath, newName) => { void fileOps.renameEntry(oldPath, newName) }}
        onDeleteEntry={(path) => { void fileOps.deleteEntry(path) }}
        onRevealEntry={(path) => { fileOps.revealEntry(path) }}
        onLoadChildren={(dir) => { void fileOps.loadChildren(dir) }}
        onOpenFolderPath={(dir) => { void fileOps.openFolderPath(dir) }}
        onNotify={notifyDrop}
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
      />

      <div className="content-col">
        <TabBar
          onSelect={(id) => { void fileOps.selectTab(id) }}
          onClose={(id) => { void fileOps.closeTab(id) }}
          onCloseOthers={(id) => { void fileOps.closeOtherTabs(id) }}
          onCloseRight={(id) => { void fileOps.closeTabsToRight(id) }}
          onCloseSaved={() => { void fileOps.closeSavedTabs() }}
          onCloseAll={() => { void fileOps.closeAllTabs() }}
          onCopyPath={(path) => { void window.lekha.writeClipboard({ text: path }) }}
          onReveal={(path) => { fileOps.revealEntry(path) }}
          onNew={() => { void fileOps.newFile() }}
          windowColor={windowColor}
          onSetWindowColor={handleSetWindowColor}
        />

        {externalNotice !== null && (
          <div className="external-notice" role="status">
            <span className="external-notice__text">{externalNotice}</span>
            <button
              type="button"
              className="external-notice__dismiss no-drag"
              aria-label="Dismiss"
              onClick={() => setExternalNotice(null)}
            >
              ×
            </button>
          </div>
        )}

        <RecoveryNotice onSave={() => { void fileOps.save() }} />

        <EditorDropZone
          onOpenFolder={(dir) => { void fileOps.openFolderPath(dir) }}
          onOpenFiles={(paths) => { for (const p of paths) void fileOps.openPath(p) }}
          onNotify={notifyDrop}
        >
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
          {documentCount === 0 && (
            <EmptyState
              onNew={() => dispatch('new')}
              onOpen={() => dispatch('open')}
              onOpenFolder={() => dispatch('openFolder')}
            />
          )}
        </EditorDropZone>

        {showStatusBar && documentCount > 0 && (
          <StatusBar onToggleSource={handleToggleSource} onShowStats={toggleStatsPanel} />
        )}
      </div>

      {dropToast !== null && (
        <div className="drop-toast" role="status">{dropToast}</div>
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
          if (path !== null) void fileOps.renameEntry(path, newName)
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

      <Preferences
        open={prefsOpen}
        onClose={() => setPrefsOpen(false)}
        onApplyAutoSave={handleApplyAutoSave}
      />

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

      {/* Sidebar toggle: rendered LAST inside .app so its -webkit-app-region:
          no-drag is subtracted AFTER the sidebar/tab-bar drag regions in DOM
          order. Chromium computes draggable regions in layout-tree order, not
          paint order, so a no-drag element that precedes an overlapping drag
          region gets re-covered by it and stops receiving clicks (the click
          becomes a window drag). Keeping it last keeps the button clickable. */}
      <SidebarToggle />
    </div>
  )
}
