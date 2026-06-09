import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { readTextFile, writeFileAtomic } from '@main/fs-helpers'
import { collectMarkdownPaths } from '@main/ipc/search'
import { replaceAllInText } from '@shared/textSearch'

export interface ReplaceInFolderArgs {
  root: string
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  /** Absolute paths to leave untouched (e.g. files open with unsaved edits). */
  skipPaths: string[]
}

export interface ReplaceInFolderResult {
  filesChanged: number
  replacements: number
  changedPaths: string[]
}

/**
 * Enumerate markdown files under `root`, replace matches in each file NOT in
 * `skipPaths`, write changed files atomically. Best-effort: an unreadable or
 * unwritable file is skipped. Exported for unit testing.
 */
export async function replaceInFolderFiles(
  args: ReplaceInFolderArgs,
): Promise<ReplaceInFolderResult> {
  const { root, query, replacement, caseSensitive, wholeWord, skipPaths } = args
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
  const changedPaths: string[] = []
  let replacements = 0

  for (const filePath of paths) {
    if (skip.has(filePath)) continue
    let content: string
    try {
      content = await readTextFile(filePath)
    } catch {
      continue
    }
    const { text, count } = replaceAllInText(content, query, replacement, opts)
    if (count === 0) continue
    try {
      await writeFileAtomic(filePath, text)
    } catch {
      continue
    }
    changedPaths.push(filePath)
    replacements += count
  }

  return { filesChanged: changedPaths.length, replacements, changedPaths }
}

/** Register the `fs:replaceInFolder` IPC handler. */
export function registerReplaceHandlers(): void {
  ipcMain.handle(IPC.replaceInFolder, async (_event, args: ReplaceInFolderArgs) => {
    return replaceInFolderFiles(args)
  })
}
