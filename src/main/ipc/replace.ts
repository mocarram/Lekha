import { guardedIpc } from '@main/ipcGuard'
import { IPC } from '@shared/ipc-channels'
import { writeFileAtomic, mapPool } from '@main/fs-helpers'
import { assertPathAllowed } from '@main/pathPolicy'
import { collectMarkdownPaths, readScannableFile } from '@main/ipc/search'
import { replaceAllInText } from '@shared/textSearch'

export interface ReplaceInFolderArgs {
  root: string
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  /** Absolute paths to leave untouched (e.g. files open with unsaved edits). */
  skipPaths: string[]
  /**
   * When true: count what WOULD change, writing nothing. The confirm dialog
   * uses this for exact numbers - the sidebar's search results are capped
   * (200 files / 20 matches per file) while the replace itself is not, so
   * counting from the visible results under-reported large replaces.
   */
  dryRun?: boolean
}

export interface ReplaceInFolderResult {
  filesChanged: number
  replacements: number
  changedPaths: string[]
}

/**
 * Enumerate markdown files under `root`, replace matches in each file NOT in
 * `skipPaths`, write changed files atomically (or, with `dryRun`, only count
 * what would change). Best-effort: an unreadable or unwritable file is
 * skipped. Exported for unit testing.
 */
export async function replaceInFolderFiles(
  args: ReplaceInFolderArgs,
): Promise<ReplaceInFolderResult> {
  const { root, query, replacement, caseSensitive, wholeWord, skipPaths, dryRun } = args
  const empty: ReplaceInFolderResult = { filesChanged: 0, replacements: 0, changedPaths: [] }
  if (!query) return empty

  const skip = new Set(skipPaths)
  let paths: string[]
  try {
    paths = await collectMarkdownPaths(root)
  } catch {
    return empty
  }

  const opts = { caseSensitive, wholeWord }

  // Read/replace/write with bounded concurrency. readScannableFile applies the
  // SAME unreadable + size-cap skip rules as search, so a replace only ever
  // touches files whose matches the search results could have shown.
  const outcomes = await mapPool(paths, 8, async (filePath): Promise<{ filePath: string; count: number } | null> => {
    if (skip.has(filePath)) return null
    const content = await readScannableFile(filePath)
    if (content === null) return null
    const { text, count } = replaceAllInText(content, query, replacement, opts)
    if (count === 0) return null
    if (!dryRun) {
      try {
        await writeFileAtomic(filePath, text)
      } catch {
        return null
      }
    }
    return { filePath, count }
  })

  const changedPaths: string[] = []
  let replacements = 0
  for (const o of outcomes) {
    if (!o) continue
    changedPaths.push(o.filePath)
    replacements += o.count
  }

  return { filesChanged: changedPaths.length, replacements, changedPaths }
}

/** Register the `fs:replaceInFolder` IPC handler. */
export function registerReplaceHandlers(): void {
  guardedIpc.handle(IPC.replaceInFolder, async (_event, args: ReplaceInFolderArgs) => {
    // The root must be a user-opened workspace (path policy); the writes stay
    // within it by construction.
    assertPathAllowed(String(args.root))
    return replaceInFolderFiles(args)
  })
}
