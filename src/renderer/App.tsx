import { useRef, useCallback, useState, useEffect } from 'react'
import { EditorPane, type EditorPaneHandle } from '@renderer/editor/EditorPane'
import { useFileOps } from '@renderer/hooks/useFileOps'
import { useCommands } from '@renderer/hooks/useCommands'
import { useStartup } from '@renderer/hooks/useStartup'
import { useEditorStore } from '@renderer/store/editorStore'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { TitleBar } from '@renderer/components/TitleBar'
import { StatusBar } from '@renderer/components/StatusBar'
import { Sidebar } from '@renderer/components/Sidebar'
import { FindReplace } from '@renderer/components/FindReplace'
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

  // Find/Replace overlay state
  const [findState, setFindState] = useState<{
    open: boolean
    mode: 'find' | 'replace'
  }>({ open: false, mode: 'find' })

  // Wire native menu commands to editor / file ops / sidebar / find
  useCommands(editorRef, fileOps, {
    onFind: () => { setFindState({ open: true, mode: 'find' }) },
    onReplace: () => { setFindState({ open: true, mode: 'replace' }) },
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
        />

        <EditorPane
          ref={editorRef}
          initialMarkdown={WELCOME_MARKDOWN}
          onChange={handleChange}
          className="editor-pane"
        />
      </div>

      <StatusBar onToggleSource={handleToggleSource} />

      <FindReplace
        open={findState.open}
        mode={findState.mode}
        editorRef={editorRef}
        onClose={() => setFindState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  )
}
