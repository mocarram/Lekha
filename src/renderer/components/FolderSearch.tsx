import { useState, useRef, useEffect, useCallback } from 'react'
import type { FolderSearchResult } from '@shared/types'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'

/** Extract the last path segment (file name) from an absolute file path. */
function getFileName(filePath: string): string {
  return filePath.replace(/.*[/\\]/, '')
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FolderSearchProps {
  /** Root folder to search. When null the empty-state shows "No folder open". */
  rootFolder: string | null
  /**
   * Called when the user clicks a match result.
   * The consumer opens the file and triggers the in-document find so the
   * editor highlights and navigates to the matching text.
   */
  onOpenResult: (filePath: string, query: string, caseSensitive: boolean) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 250

/**
 * FolderSearch - sidebar panel for searching all Markdown files in the open folder.
 *
 * Renders a query input with a case-sensitive toggle. Results are grouped by
 * file: a file-name header followed by matching lines with the query substring
 * highlighted inline. Clicking a match calls `onOpenResult(filePath, query)`
 * which the parent wires to openPath + setFind/findNext so the editor jumps
 * to the match.
 *
 * Debounced 250ms to avoid IPC spam on every keystroke.
 */
export function FolderSearch({ rootFolder, onOpenResult }: FolderSearchProps) {
  // Query + case flag live in the workspace store so they survive the sidebar
  // collapsing (which unmounts this panel). The mount-time debounced effect
  // below re-runs the search from the restored query, so results come back too.
  const query = useWorkspaceStore((s) => s.searchQuery)
  const caseSensitive = useWorkspaceStore((s) => s.searchCaseSensitive)
  const [results, setResults] = useState<FolderSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the query input when the search panel opens. FolderSearch mounts fresh
  // each time the user switches to the Search tab (Sidebar renders it
  // conditionally), so a mount effect focuses the field on every open.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Run a search via IPC and update results state.
  const runSearch = useCallback(
    (q: string, cs: boolean) => {
      if (!rootFolder || q.length < 1) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      window.lekha
        .searchFolder({ root: rootFolder, query: q, caseSensitive: cs })
        .then((res) => {
          setResults(res)
          setSearching(false)
        })
        .catch(() => {
          setResults([])
          setSearching(false)
        })
    },
    [rootFolder],
  )

  // Debounce the search on query/caseSensitive changes.
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      runSearch(query, caseSensitive)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [query, caseSensitive, runSearch])

  // Total match count across all files.
  const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0)

  return (
    <div className="folder-search">
      {/* Search input row */}
      <div className="folder-search__input-row">
        <input
          ref={inputRef}
          className="folder-search__input"
          type="text"
          placeholder="Search in folder..."
          value={query}
          onChange={(e) => { useWorkspaceStore.getState().setSearchQuery(e.target.value) }}
          aria-label="Search query"
          spellCheck={false}
        />
        <button
          type="button"
          className={`folder-search__case-btn${caseSensitive ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSearchCaseSensitive(!caseSensitive) }}
          title={caseSensitive ? 'Case-sensitive: on' : 'Match case (case-sensitive)'}
          aria-label="Match case"
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
      </div>

      {/* Status line */}
      {query.length > 0 && !searching && (
        <div className="folder-search__status">
          {results.length > 0
            ? `${totalMatches} result${totalMatches !== 1 ? 's' : ''} in ${results.length} file${results.length !== 1 ? 's' : ''}`
            : 'No matches'}
        </div>
      )}

      {/* Empty states */}
      {!rootFolder && (
        <div className="folder-search__empty">No folder open</div>
      )}

      {/* Results grouped by file */}
      {results.length > 0 && (
        <div className="folder-search__results">
          {results.map((file) => (
            <div key={file.filePath} className="folder-search__file-group">
              <div className="folder-search__file-header" title={file.filePath}>
                {getFileName(file.filePath)}
              </div>
              {file.matches.map((match) => (
                <button
                  key={`${file.filePath}:${match.lineNumber}`}
                  type="button"
                  className="folder-search__match"
                  onClick={() => { onOpenResult(file.filePath, query, caseSensitive) }}
                  title={`Line ${match.lineNumber}: ${match.lineText}`}
                >
                  <span className="folder-search__line-num">{match.lineNumber}</span>
                  <span className="folder-search__line-text">
                    {highlightMatch(match.lineText, query, caseSensitive)}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline highlight helper
// ---------------------------------------------------------------------------

/**
 * Split `lineText` around occurrences of `query` and return an array of React
 * spans - plain text runs and highlighted <mark> runs alternating.
 */
function highlightMatch(
  lineText: string,
  query: string,
  caseSensitive: boolean,
): React.ReactNode[] {
  if (!query) return [lineText]

  const parts: React.ReactNode[] = []
  const needle = caseSensitive ? query : query.toLowerCase()
  const haystack = caseSensitive ? lineText : lineText.toLowerCase()
  let cursor = 0
  let idx = haystack.indexOf(needle, cursor)

  while (idx !== -1) {
    if (idx > cursor) {
      parts.push(lineText.slice(cursor, idx))
    }
    parts.push(
      <mark key={idx} className="folder-search__highlight">
        {lineText.slice(idx, idx + query.length)}
      </mark>,
    )
    cursor = idx + query.length
    idx = haystack.indexOf(needle, cursor)
  }

  if (cursor < lineText.length) {
    parts.push(lineText.slice(cursor))
  }

  return parts
}
