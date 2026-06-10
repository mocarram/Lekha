/**
 * SearchFindSync - keeps the open file's find highlights in sync with the LIVE
 * folder-search query while the Search tab is showing.
 *
 * The highlight is otherwise only applied when a result is clicked, so editing
 * the query afterwards left the open file showing stale highlights until the
 * next click. The refresh happens in place WITHOUT scrolling, so navigation
 * stays an explicit result-click action. Debounced to match the folder search.
 *
 * Render-free child component (returns null) rather than an App effect: the
 * search query changes on every keystroke in the search box, and subscribing
 * from App re-rendered the entire tree per character. Here the re-render cost
 * is this empty component.
 */
import { useEffect, type RefObject } from 'react'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import type { EditorPaneHandle } from '@renderer/editor/EditorPane'

/** Debounce matching FolderSearch's own search debounce. */
const SYNC_DEBOUNCE_MS = 200

interface SearchFindSyncProps {
  editorRef: RefObject<EditorPaneHandle | null>
}

export function SearchFindSync({ editorRef }: SearchFindSyncProps) {
  const sidebarVisible = useWorkspaceStore((s) => s.sidebarVisible)
  const sidebarTab = useWorkspaceStore((s) => s.sidebarTab)
  const searchQuery = useWorkspaceStore((s) => s.searchQuery)
  const searchCaseSensitive = useWorkspaceStore((s) => s.searchCaseSensitive)
  const searchWholeWord = useWorkspaceStore((s) => s.searchWholeWord)

  useEffect(() => {
    if (!sidebarVisible || sidebarTab !== 'search') return undefined
    const editor = editorRef.current
    if (!editor) return undefined
    const t = setTimeout(() => {
      if (searchQuery.length < 1) {
        editor.clearFind()
      } else {
        editor.refreshFind(searchQuery, {
          caseSensitive: searchCaseSensitive,
          wholeWord: searchWholeWord,
        })
      }
    }, SYNC_DEBOUNCE_MS)
    return () => { clearTimeout(t) }
  }, [editorRef, sidebarVisible, sidebarTab, searchQuery, searchCaseSensitive, searchWholeWord])

  return null
}
