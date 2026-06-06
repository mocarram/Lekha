import { ipcMain } from 'electron'
import { basename } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type { FolderSearchResult, FolderSearchMatch } from '@shared/types'
import { buildFileTree, readTextFile } from '@main/fs-helpers'

// ---------------------------------------------------------------------------
// Safety caps
// ---------------------------------------------------------------------------

/** Maximum number of line matches collected per file. */
const MAX_MATCHES_PER_FILE = 20

/** Maximum number of files whose matches are included in the result. */
const MAX_RESULT_FILES = 200

/** Maximum line text length returned (trimmed to avoid huge payloads). */
const MAX_LINE_LENGTH = 300

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
): FolderSearchMatch[] {
  if (query.length === 0) return []

  const needle = caseSensitive ? query : query.toLowerCase()
  const lines = content.split('\n')
  const results: FolderSearchMatch[] = []

  for (let i = 0; i < lines.length; i++) {
    if (results.length >= MAX_MATCHES_PER_FILE) break
    const raw = lines[i] ?? ''
    const haystack = caseSensitive ? raw : raw.toLowerCase()
    if (haystack.includes(needle)) {
      const lineText = raw.length > MAX_LINE_LENGTH
        ? raw.slice(0, MAX_LINE_LENGTH) + '…'
        : raw
      results.push({
        lineNumber: i + 1, // 1-based
        lineText,
      })
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
async function collectMarkdownPaths(dir: string): Promise<string[]> {
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

// ---------------------------------------------------------------------------
// IPC search args type
// ---------------------------------------------------------------------------

interface SearchFolderArgs {
  root: string
  query: string
  caseSensitive: boolean
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
  ipcMain.handle(IPC.searchFolder, async (_event, args: SearchFolderArgs) => {
    const { root, query, caseSensitive } = args

    // Guard: empty query returns nothing.
    if (!query || query.length < 1) return []

    const filePaths = await collectMarkdownPaths(root)
    const results: FolderSearchResult[] = []

    for (const filePath of filePaths) {
      if (results.length >= MAX_RESULT_FILES) break

      let content: string
      try {
        content = await readTextFile(filePath)
      } catch {
        // Skip unreadable files silently.
        continue
      }

      const matches = searchInText(content, query, caseSensitive)
      if (matches.length > 0) {
        results.push({
          filePath,
          fileName: basename(filePath),
          matches,
        })
      }
    }

    return results
  })
}
