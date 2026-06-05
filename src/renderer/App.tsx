import { useRef, useCallback, useState, useEffect } from 'react'
import { EditorPane, type EditorPaneHandle } from '@renderer/editor/EditorPane'
import { useFileOps } from '@renderer/hooks/useFileOps'
import { useCommands } from '@renderer/hooks/useCommands'
import { useEditorStore } from '@renderer/store/editorStore'
import { parseMarkdown } from '@renderer/editor/parser'
import { getOutline } from '@renderer/editor/outline'
import { countWords } from '@renderer/editor/wordCount'
import { TitleBar } from '@renderer/components/TitleBar'
import { StatusBar } from '@renderer/components/StatusBar'
import { Sidebar } from '@renderer/components/Sidebar'
import { FindReplace } from '@renderer/components/FindReplace'

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

export default function App() {
  const editorRef = useRef<EditorPaneHandle>(null)
  const fileOps = useFileOps(editorRef)

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

  // Debounce timer ref - used to delay outline/count recomputation so we
  // don't parse on every keystroke. Cleared on unmount to avoid a setState
  // call on an already-unmounted component.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      const doc = parseMarkdown(markdown)
      useEditorStore.getState().setOutline(getOutline(doc))
      useEditorStore.getState().setCounts(countWords(doc))
    }, 150)
  }, [])

  const handleToggleSource = useCallback(() => {
    editorRef.current?.toggleMode()
    // Sync the new mode back to the store so StatusBar reflects the change.
    const newMode = editorRef.current?.getMode() ?? 'wysiwyg'
    useEditorStore.getState().setMode(newMode)
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
