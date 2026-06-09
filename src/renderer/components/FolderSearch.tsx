import { useState, useRef, useEffect, useCallback } from 'react'
import type { FolderSearchResult } from '@shared/types'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useDocumentsStore } from '@renderer/store/documentsStore'
import { findMatchRanges } from '@shared/textSearch'

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
  /** Called with paths changed on disk by a folder replace, so the parent can
   *  reload any open in a clean tab. */
  onReplaced: (changedPaths: string[]) => void
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
export function FolderSearch({ rootFolder, onOpenResult, onReplaced }: FolderSearchProps) {
  // Query + case flag live in the workspace store so they survive the sidebar
  // collapsing (which unmounts this panel). The mount-time debounced effect
  // below re-runs the search from the restored query, so results come back too.
  const query = useWorkspaceStore((s) => s.searchQuery)
  const caseSensitive = useWorkspaceStore((s) => s.searchCaseSensitive)
  const wholeWord = useWorkspaceStore((s) => s.searchWholeWord)
  const [results, setResults] = useState<FolderSearchResult[]>([])
  const [searching, setSearching] = useState(false)

  const replaceText = useWorkspaceStore((s) => s.searchReplaceText)
  const [replaceOpen, setReplaceOpen] = useState(false)
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null)

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
    (q: string, cs: boolean, ww: boolean) => {
      if (!rootFolder || q.length < 1) {
        setResults([])
        setSearching(false)
        return
      }
      setSearching(true)
      window.lekha
        .searchFolder({ root: rootFolder, query: q, caseSensitive: cs, wholeWord: ww })
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

  const handleReplaceAll = useCallback(async () => {
    if (!rootFolder || query.length < 1 || results.length === 0) return
    // Files in the results that are open with unsaved edits -> skip (never clobber).
    const dirtyOpen = new Set(
      useDocumentsStore.getState().documents
        .filter((d) => d.path !== null && d.isDirty)
        .map((d) => d.path as string),
    )
    const skipPaths = results.map((r) => r.filePath).filter((p) => dirtyOpen.has(p))
    const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0)
    const detail =
      `Replace ${totalMatches} match${totalMatches === 1 ? '' : 'es'} in ` +
      `${results.length} file${results.length === 1 ? '' : 's'}.` +
      (skipPaths.length > 0
        ? ` ${skipPaths.length} open unsaved file${skipPaths.length === 1 ? '' : 's'} will be skipped.`
        : '') +
      ' This cannot be undone.'

    const ok = await window.lekha.confirmReplace(detail)
    if (!ok) return

    const res = await window.lekha.replaceInFolder({
      root: rootFolder,
      query,
      replacement: replaceText,
      caseSensitive,
      wholeWord,
      skipPaths,
    })
    onReplaced(res.changedPaths)
    setReplaceStatus(
      `Replaced ${res.replacements} in ${res.filesChanged} file${res.filesChanged === 1 ? '' : 's'}` +
      (skipPaths.length > 0 ? ` · skipped ${skipPaths.length} unsaved` : ''),
    )
    runSearch(query, caseSensitive, wholeWord)
  }, [rootFolder, query, results, replaceText, caseSensitive, wholeWord, onReplaced, runSearch])

  // Debounce the search on query/caseSensitive changes.
  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      runSearch(query, caseSensitive, wholeWord)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current !== null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [query, caseSensitive, wholeWord, runSearch])

  // Total match count across all files.
  const totalMatches = results.reduce((acc, r) => acc + r.matches.length, 0)

  return (
    <div className="folder-search">
      {/* Search input row - a native-style capsule: magnifier + input + Aa. */}
      <div className="folder-search__input-row">
        <svg
          className="folder-search__icon"
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="4.25" />
          <line x1="10.4" y1="10.4" x2="14" y2="14" />
        </svg>
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
        <button
          type="button"
          className={`folder-search__case-btn${wholeWord ? ' active' : ''}`}
          onClick={() => { useWorkspaceStore.getState().setSearchWholeWord(!wholeWord) }}
          title={wholeWord ? 'Whole word: on' : 'Match whole word'}
          aria-label="Match whole word"
          aria-pressed={wholeWord}
        >
          ab
        </button>
      </div>

      {/* Replace toggle + row (collapsed by default, VS Code style). */}
      <button
        type="button"
        className="folder-search__replace-toggle"
        aria-label={replaceOpen ? 'Hide replace' : 'Show replace'}
        aria-expanded={replaceOpen}
        title={replaceOpen ? 'Hide replace' : 'Show replace'}
        onClick={() => { setReplaceOpen((v) => !v) }}
      >
        {replaceOpen ? '⌄ Replace' : '› Replace'}
      </button>
      {replaceOpen && (
        <div className="folder-search__input-row folder-search__replace-row">
          <input
            className="folder-search__input"
            type="text"
            placeholder="Replace in folder..."
            value={replaceText}
            onChange={(e) => { useWorkspaceStore.getState().setSearchReplaceText(e.target.value) }}
            aria-label="Replace with"
            spellCheck={false}
          />
          <button
            type="button"
            className="folder-search__replace-all"
            onClick={() => { void handleReplaceAll() }}
            disabled={query.length < 1 || results.length === 0}
            title="Replace all matches in the folder"
          >
            Replace All
          </button>
        </div>
      )}

      {replaceStatus !== null && (
        <div className="folder-search__status">{replaceStatus}</div>
      )}

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
                    {highlightMatch(match.lineText, query, caseSensitive, wholeWord)}
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
  wholeWord: boolean,
): React.ReactNode[] {
  if (!query) return [lineText]
  const ranges = findMatchRanges(lineText, query, { caseSensitive, wholeWord })
  if (ranges.length === 0) return [lineText]
  const parts: React.ReactNode[] = []
  let cursor = 0
  ranges.forEach(([start, end], i) => {
    if (start > cursor) parts.push(lineText.slice(cursor, start))
    parts.push(
      <mark key={i} className="folder-search__highlight">
        {lineText.slice(start, end)}
      </mark>,
    )
    cursor = end
  })
  if (cursor < lineText.length) parts.push(lineText.slice(cursor))
  return parts
}
