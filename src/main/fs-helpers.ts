import { readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import type { FileNode, FileStat } from '@shared/types'

const MD_EXTENSIONS = new Set(['.md', '.markdown'])

/** Returns true for dotfiles / dotdirs (names starting with "."). */
function isDotEntry(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Recursively builds a tree of markdown files and directories.
 * Dotfiles, dotdirs, and node_modules are excluded.
 * Only files with .md / .markdown extensions are included.
 * Sort order: directories first (alpha, case-insensitive), then files (alpha, case-insensitive).
 */
export async function buildFileTree(dir: string): Promise<FileNode[]> {
  const entries = await readdir(dir, { withFileTypes: true })

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    // Skip dotfiles, dotdirs and node_modules.
    if (isDotEntry(entry.name) || entry.name === 'node_modules') continue

    const absPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      const children = await buildFileTree(absPath)
      dirs.push({ name: entry.name, path: absPath, isDirectory: true, children })
    } else if (entry.isFile() && MD_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push({ name: entry.name, path: absPath, isDirectory: false })
    }
  }

  const byName = (a: FileNode, b: FileNode) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())

  dirs.sort(byName)
  files.sort(byName)

  return [...dirs, ...files]
}

/**
 * Atomically writes content to a file by writing to a temporary ".tmp" sibling
 * first, then renaming it into place.  This prevents partial writes from
 * leaving a corrupt file if the process is killed mid-write.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp`
  await writeFile(tmp, content, 'utf8')
  // If rename fails (e.g. cross-device), clean up the orphaned .tmp file
  // best-effort (swallow unlink errors) and rethrow the original error.
  try {
    await rename(tmp, path)
  } catch (renameErr) {
    try {
      await unlink(tmp)
    } catch {
      // Best-effort: ignore unlink failure, tmp cleanup is not critical.
    }
    throw renameErr
  }
}

/** Reads a file as UTF-8 text. */
export async function readTextFile(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

/** Returns size + created/modified timestamps for a file (for File ▸ Get Info). */
export async function statFile(path: string): Promise<FileStat> {
  const s = await stat(path)
  return { sizeBytes: s.size, birthtimeMs: s.birthtimeMs, mtimeMs: s.mtimeMs }
}

