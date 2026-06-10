import { guardedIpc } from '@main/ipcGuard'
import { basename } from 'node:path'
import { stat } from 'node:fs/promises'
import { IPC } from '@shared/ipc-channels'
import type { FolderSearchResult, FolderSearchMatch } from '@shared/types'
import { buildFileTree, readTextFile, mapPool } from '@main/fs-helpers'
import { assertPathAllowed } from '@main/pathPolicy'
import { findMatchRanges } from '@shared/textSearch'

// ---------------------------------------------------------------------------
// Safety caps
// ---------------------------------------------------------------------------

/** Maximum number of line matches collected per file. */
const MAX_MATCHES_PER_FILE = 20

/** Maximum number of files whose matches are included in the result. */
const MAX_RESULT_FILES = 200

/** Maximum line text length returned (trimmed to avoid huge payloads). */
const MAX_LINE_LENGTH = 300

/**
 * Per-file size cap for search AND folder replace (replace must skip exactly
 * the files search skipped, or a replace would touch matches the user never
 * saw). One stray huge file must not be slurped into the main-process heap on
 * every debounced search keystroke.
 */
export const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

/** How many files are read concurrently during a folder scan. */
const READ_CONCURRENCY = 8

// ---------------------------------------------------------------------------
// Pure helper (exported for unit testing without fs)
// ---------------------------------------------------------------------------

/**
 * Scan `content` line-by-line and collect every line that contains `query`.
 *
 * Pure - no filesystem access. Suitable for unit testing in isolation.
 *
 * @param content       - The full file text (any line endings).
 * @param query         - The search string. Empty string returns [].
 * @param caseSensitive - When false the comparison is lowercased.
 * @returns Up to MAX_MATCHES_PER_FILE matches in document order.
 */
export function searchInText(
  content: string,
  query: string,
  caseSensitive: boolean,
  wholeWord = false,
): FolderSearchMatch[] {
  if (query.length === 0) return []

  const lines = content.split('\n')
  const results: FolderSearchMatch[] = []
  const opts = { caseSensitive, wholeWord }

  for (let i = 0; i < lines.length; i++) {
    if (results.length >= MAX_MATCHES_PER_FILE) break
    const raw = lines[i] ?? ''
    if (findMatchRanges(raw, query, opts).length > 0) {
      const lineText = raw.length > MAX_LINE_LENGTH
        ? raw.slice(0, MAX_LINE_LENGTH) + '…'
        : raw
      results.push({ lineNumber: i + 1, lineText })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Flat file enumeration reusing buildFileTree's filters
// ---------------------------------------------------------------------------

/**
 * Collect all Markdown file paths under `dir` in a flat list.
 * Reuses buildFileTree (which already applies the dotfile/node_modules/
 * extension filters) by recursing into directory children.
 */
export async function collectMarkdownPaths(dir: string): Promise<string[]> {
  const tree = await buildFileTree(dir)
  const paths: string[] = []

  function walk(nodes: typeof tree): void {
    for (const node of nodes) {
      if (node.isDirectory && node.children) {
        walk(node.children)
      } else if (!node.isDirectory) {
        paths.push(node.path)
      }
    }
  }

  walk(tree)
  return paths
}

/**
 * Read a file's content for scanning, or null when it is unreadable OR larger
 * than MAX_SEARCH_FILE_BYTES. Shared by search and replace so both skip the
 * exact same set of files.
 */
export async function readScannableFile(filePath: string): Promise<string | null> {
  try {
    const s = await stat(filePath)
    if (s.size > MAX_SEARCH_FILE_BYTES) return null
    return await readTextFile(filePath)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// IPC search args type
// ---------------------------------------------------------------------------

interface SearchFolderArgs {
  root: string
  query: string
  caseSensitive: boolean
  wholeWord: boolean
}

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

/**
 * Register the `fs:searchFolder` IPC handler.
 *
 * The handler enumerates all Markdown files under `root` (reusing the same
 * dotfile/extension filters as buildFileTree), reads each file, and returns
 * FolderSearchResult[] - one entry per file that contains at least one match.
 *
 * Safety caps: at most MAX_RESULT_FILES files and MAX_MATCHES_PER_FILE
 * matches per file are included to prevent huge payloads on large vaults.
 * Short queries (<1 char) return [] immediately.
 */
export function registerSearchHandlers(): void {
  guardedIpc.handle(IPC.searchFolder, async (_event, args: SearchFolderArgs) => {
    const { root, query, caseSensitive, wholeWord } = args

    // Guard: empty query returns nothing.
    if (!query || query.length < 1) return []

    // The root must be a user-opened workspace (path policy).
    assertPathAllowed(String(root))

    // Enumerate the vault. A missing/unreadable root makes readdir reject with a
    // raw Node error; treat that as "no files" (an empty result) the same way
    // listBackups/listUserThemes treat an unreadable directory as empty, rather
    // than surfacing a raw error to the renderer.
    let filePaths: string[]
    try {
      filePaths = await collectMarkdownPaths(root)
    } catch {
      return []
    }

    // Read + scan with bounded concurrency (sequential awaits made big vaults
    // pay total-latency = sum of per-file latency). Output order follows the
    // enumeration order regardless of which read finishes first. Once enough
    // matching files were found, stop scheduling further reads.
    let found = 0
    const scanned = await mapPool(
      filePaths,
      READ_CONCURRENCY,
      async (filePath): Promise<FolderSearchResult | null> => {
        const content = await readScannableFile(filePath)
        if (content === null) return null // unreadable or oversized - skip
        const matches = searchInText(content, query, caseSensitive, wholeWord)
        if (matches.length === 0) return null
        found += 1
        return { filePath, fileName: basename(filePath), matches }
      },
      () => found >= MAX_RESULT_FILES,
    )

    const results: FolderSearchResult[] = []
    for (const r of scanned) {
      if (r === null || r === undefined) continue
      results.push(r)
      if (results.length >= MAX_RESULT_FILES) break
    }
    return results
  })
}
