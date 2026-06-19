import { readFile, writeFile, rename, unlink, readdir, stat, open } from 'node:fs/promises'
import { basename, join, extname, dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FileNode, FileStat, ArticleEntry, OpenFileStatus } from '@shared/types'
// The tree/search/articles file filter is the SAME openable set used by
// drag-drop, quick-open, and OS Open With (src/shared/openable.ts), so every
// surface agrees on which files exist.
import { OPENABLE_EXT_SET } from '@shared/openable'

/** Returns true for dotfiles / dotdirs (names starting with "."). */
function isDotEntry(name: string): boolean {
  return name.startsWith('.')
}

/**
 * Map `items` through async `fn` with at most `limit` in flight, preserving
 * input order in the result. `shouldStop` lets a scan stop scheduling new work
 * once enough results were collected (already-started items still finish, so
 * everything before the stop point completes deterministically). Used by the
 * folder scans (search / replace / articles) so a big vault never opens an
 * unbounded number of files at once.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  shouldStop?: () => boolean,
): Promise<Array<R | undefined>> {
  const out = new Array<R | undefined>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      if (shouldStop?.()) return
      const i = nextIndex++
      if (i >= items.length) return
      out[i] = await fn(items[i] as T)
    }
  })
  await Promise.all(workers)
  return out
}

const byName = (a: FileNode, b: FileNode) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase())

/**
 * Lists ONE directory level: immediate openable files and sub-directories.
 * Dotfiles, dotdirs, and node_modules are excluded; only files in the shared
 * openable set (md/markdown/mdown/mkd/mdx/txt/text) are included.
 * Sub-directories are returned with `children` LEFT UNDEFINED (unloaded) - the
 * sidebar loads them lazily on expand. Sort order: directories first (alpha,
 * case-insensitive), then files.
 */
export async function listDirChildren(dir: string): Promise<FileNode[]> {
  const entries = await readdir(dir, { withFileTypes: true })

  const dirs: FileNode[] = []
  const files: FileNode[] = []

  for (const entry of entries) {
    if (isDotEntry(entry.name) || entry.name === 'node_modules') continue

    const absPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, path: absPath, isDirectory: true })
    } else if (entry.isFile() && OPENABLE_EXT_SET.has(extname(entry.name).toLowerCase())) {
      files.push({ name: entry.name, path: absPath, isDirectory: false })
    }
  }

  dirs.sort(byName)
  files.sort(byName)

  return [...dirs, ...files]
}

/**
 * Recursively builds the full tree of openable files and directories. Used by
 * folder-wide search to enumerate every file up front. The lazy sidebar tree
 * uses listDirChildren instead and loads levels on demand.
 * Sort order: directories first (alpha, case-insensitive), then files.
 */
export async function buildFileTree(dir: string): Promise<FileNode[]> {
  const level = await listDirChildren(dir)
  for (const node of level) {
    if (node.isDirectory) {
      node.children = await buildFileTree(node.path)
    }
  }
  return level
}

/**
 * Atomically writes content to a file by writing to a UNIQUE temporary sibling
 * first, then renaming it into place. This prevents partial writes from leaving
 * a corrupt file if the process is killed mid-write.
 *
 * The tmp name carries a per-write random suffix so that two concurrent writes
 * to the SAME destination do not share one tmp file. (Crash backups for a single
 * tab can be triggered near-simultaneously by the idle-debounce, the window-blur
 * flush, and a tab-switch snapshot; with a fixed `${path}.tmp` name the first
 * rename consumed the shared tmp and the others failed with ENOENT.) Each write
 * now renames its own tmp; for an atomic replace, last-writer-wins is correct.
 */
export async function writeFileAtomic(path: string, content: string): Promise<void> {
  const tmp = `${path}.${randomUUID()}.tmp`
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
      OPENABLE_EXT_SET.has(extname(entry.name).toLowerCase())
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
 * How much of each file the Articles listing reads. Title (first `# ` heading)
 * and the ~140-char preview both come from the head of the file, so reading
 * the whole body is wasted I/O - and on a big vault, reading every file fully
 * AND concurrently spiked memory and file descriptors.
 */
const ARTICLE_HEAD_BYTES = 4096

/** How many files the Articles listing opens concurrently. */
const ARTICLE_READ_CONCURRENCY = 16

/** Read the first `maxBytes` of a file as UTF-8 (the whole file when smaller). */
async function readFileHead(path: string, maxBytes: number): Promise<string> {
  const fh = await open(path, 'r')
  try {
    const buf = Buffer.alloc(maxBytes)
    const { bytesRead } = await fh.read(buf, 0, maxBytes, 0)
    return buf.toString('utf8', 0, bytesRead)
  } finally {
    await fh.close()
  }
}

/**
 * List every markdown file under `root` as an ArticleEntry (title, preview,
 * size, mtime), sorted most-recently-modified first. Powers the Articles view.
 *
 * Reads only each file's head (title + preview live there; a heading past the
 * first 4KB falls back to the basename) with bounded concurrency.
 */
export async function listArticles(root: string): Promise<ArticleEntry[]> {
  const paths = await collectMarkdownFiles(root)
  const settled = await mapPool(
    paths,
    ARTICLE_READ_CONCURRENCY,
    async (path): Promise<ArticleEntry | null> => {
      // Guard each entry: a file enumerated above may be deleted before we stat
      // it (TOCTOU). Returning null drops that one entry rather than rejecting
      // the scan and blanking the entire list. Read failures still degrade to
      // an empty title/preview via their own .catch.
      try {
        const [content, s] = await Promise.all([
          readFileHead(path, ARTICLE_HEAD_BYTES).catch(() => ''),
          stat(path),
        ])
        return {
          path,
          title: deriveArticleTitle(content, path),
          mtimeMs: s.mtimeMs,
          sizeBytes: s.size,
          preview: deriveArticlePreview(content),
        }
      } catch {
        return null
      }
    },
  )
  const entries = settled.filter((e): e is ArticleEntry => e !== null && e !== undefined)
  entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return entries
}

