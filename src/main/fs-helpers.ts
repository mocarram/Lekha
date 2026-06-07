import { readFile, writeFile, rename, unlink, readdir, stat } from 'node:fs/promises'
import { basename, join, extname, dirname } from 'node:path'
import type { FileNode, FileStat, ArticleEntry, OpenFileStatus } from '@shared/types'

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

/** Returns size + created/modified timestamps + inode for a file. */
export async function statFile(path: string): Promise<FileStat> {
  const s = await stat(path)
  return {
    sizeBytes: s.size,
    birthtimeMs: s.birthtimeMs,
    mtimeMs: s.mtimeMs,
    inode: Number(s.ino),
  }
}

/**
 * Find the file in `dir` whose inode matches `inode`, returning its full path
 * or null. Used to recover a same-folder rename of an open document (a rename
 * keeps the inode). Non-recursive; skips dotfiles and non-regular files. Only
 * called when an open file's path went missing, so the directory scan is rare.
 */
export async function findPathByInode(dir: string, inode: number): Promise<string | null> {
  if (!inode) return null
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return null
  }
  for (const name of entries) {
    if (isDotEntry(name)) continue
    const full = join(dir, name)
    try {
      const s = await stat(full)
      if (s.isFile() && Number(s.ino) === inode) return full
    } catch {
      // Unreadable entry - skip.
    }
  }
  return null
}

/**
 * Verify an open document is still at `path`. When the path is gone, try to
 * recover a same-folder rename by inode.
 */
export async function verifyOpenFile(path: string, inode: number): Promise<OpenFileStatus> {
  try {
    await stat(path)
    return { status: 'present' }
  } catch {
    const moved = await findPathByInode(dirname(path), inode)
    return moved !== null ? { status: 'renamed', newPath: moved } : { status: 'missing' }
  }
}

// ---------------------------------------------------------------------------
// Articles / Library listing
// ---------------------------------------------------------------------------

/** Collect absolute paths of every markdown file under `dir` (recursive). */
async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    if (isDotEntry(entry.name) || entry.name === 'node_modules') continue
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownFiles(abs)))
    } else if (
      entry.isFile() &&
      MD_EXTENSIONS.has(extname(entry.name).toLowerCase())
    ) {
      out.push(abs)
    }
  }
  return out
}

/** Title = first ATX `# ` heading; falls back to the basename. Pure. */
export function deriveArticleTitle(content: string, path: string): string {
  const match = /^[ \t]*#[ \t]+(.+?)[ \t]*$/m.exec(content)
  return match ? match[1]!.trim() : basename(path)
}

/** Short single-line excerpt of the body (~140 chars), title line excluded. Pure. */
export function deriveArticlePreview(content: string): string {
  const text = content
    .replace(/^---\n[\s\S]*?\n---\n/, '') // drop leading YAML front-matter
    .replace(/^[ \t]*#[ \t]+.+$/m, '') // drop the first heading line
    .replace(/[#>*_`~-]/g, ' ') // strip common markdown markers
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 140 ? `${text.slice(0, 140)}…` : text
}

/**
 * List every markdown file under `root` as an ArticleEntry (title, preview,
 * size, mtime), sorted most-recently-modified first. Powers the Articles view.
 */
export async function listArticles(root: string): Promise<ArticleEntry[]> {
  const paths = await collectMarkdownFiles(root)
  const entries = await Promise.all(
    paths.map(async (path): Promise<ArticleEntry> => {
      const [content, s] = await Promise.all([
        readFile(path, 'utf8').catch(() => ''),
        stat(path),
      ])
      return {
        path,
        title: deriveArticleTitle(content, path),
        mtimeMs: s.mtimeMs,
        sizeBytes: s.size,
        preview: deriveArticlePreview(content),
      }
    }),
  )
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return entries
}

