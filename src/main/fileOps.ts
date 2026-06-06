/**
 * fileOps.ts - filesystem entry operations for the sidebar file tree.
 *
 * Split into two parts:
 *   1. PURE helpers (isValidEntryName, targetPath, renamedPath) - path joining,
 *      extension defaulting, same-parent rename, and name validation. These are
 *      unit-tested in tests/unit/main/fileOps.test.ts.
 *   2. Thin IO wrappers (createFile, createFolder, renamePath, deletePath,
 *      revealPath) that call Node fs/promises and Electron shell. These are
 *      Electron/IO-bound and verified manually, not unit-tested.
 *
 * SAFETY:
 *   - deletePath uses shell.trashItem (moves the entry to the OS trash, which
 *     is RECOVERABLE) instead of fs.rm / fs.unlink (permanent, unrecoverable).
 *     Sidebar deletes should never be a one-way destructive action.
 *   - All names that originate from the user are validated by isValidEntryName,
 *     which rejects path separators and traversal sequences ("..", "/", "\")
 *     so a name can never escape its parent directory.
 */
import { mkdir, rename, writeFile, access, copyFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { shell } from 'electron'

const DEFAULT_EXTENSION = '.md'

/**
 * Validates a single file/folder entry name supplied by the user.
 *
 * Rejects:
 *   - empty / whitespace-only names
 *   - names containing a path separator ("/" or "\") - would target another dir
 *   - "." and ".." - current/parent-dir traversal that escapes the target dir
 *
 * This is the single chokepoint that prevents path-traversal: every create /
 * rename path is built from a name that passed this check, so the result can
 * never escape the intended parent directory.
 */
export function isValidEntryName(name: string): boolean {
  if (name.trim().length === 0) return false
  if (name.includes('/') || name.includes('\\')) return false
  if (name === '.' || name === '..') return false
  return true
}

/** Options for targetPath. */
interface TargetPathOptions {
  /** When true, do not append the default .md extension (used for folders). */
  allowMissingExt?: boolean
}

/**
 * Builds the absolute path for a new entry `name` inside `dir`.
 *
 * For files we default a missing extension to ".md" so "todo" becomes
 * "todo.md" - matching the editor's markdown focus. Pass
 * `{ allowMissingExt: true }` for folders, which should keep their exact name.
 */
export function targetPath(dir: string, name: string, options: TargetPathOptions = {}): string {
  const needsExt = !options.allowMissingExt && extname(name) === ''
  const finalName = needsExt ? `${name}${DEFAULT_EXTENSION}` : name
  return join(dir, finalName)
}

/**
 * Builds the absolute path for renaming `oldPath` to `newName`, preserving the
 * parent directory (a same-parent rename). Unlike targetPath this never
 * defaults an extension - a rename uses the exact name the user typed.
 */
export function renamedPath(oldPath: string, newName: string): string {
  return join(dirname(oldPath), newName)
}

/**
 * The default duplicate path for `srcPath`: same directory, base name suffixed
 * with " copy", extension preserved (e.g. `notes.md` -> `notes copy.md`).
 * Pure; the IO wrapper {@link duplicatePath} resolves collisions on top of this.
 */
export function duplicatedPath(srcPath: string): string {
  const ext = extname(srcPath)
  const base = basename(srcPath, ext)
  return join(dirname(srcPath), `${base} copy${ext}`)
}

// ---------------------------------------------------------------------------
// IO wrappers (Electron/fs-bound, thin, manually verified - not unit-tested)
// ---------------------------------------------------------------------------

/** Resolves true if a path exists on disk, false otherwise. */
async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Creates an empty file `name` inside `dir`. A missing extension defaults to
 * ".md". Rejects if the target already exists. Returns the new absolute path.
 */
export async function createFile(dir: string, name: string): Promise<string> {
  if (!isValidEntryName(name)) {
    throw new Error(`Invalid file name: "${name}"`)
  }
  const path = targetPath(dir, name)
  if (await pathExists(path)) {
    throw new Error(`A file or folder named "${name}" already exists.`)
  }
  // wx flag: fail if the path already exists (atomic create-only).
  await writeFile(path, '', { encoding: 'utf8', flag: 'wx' })
  return path
}

/**
 * Creates a folder `name` inside `dir`. Rejects if it already exists.
 * Returns the new absolute path.
 */
export async function createFolder(dir: string, name: string): Promise<string> {
  if (!isValidEntryName(name)) {
    throw new Error(`Invalid folder name: "${name}"`)
  }
  const path = targetPath(dir, name, { allowMissingExt: true })
  if (await pathExists(path)) {
    throw new Error(`A file or folder named "${name}" already exists.`)
  }
  await mkdir(path)
  return path
}

/**
 * Renames `oldPath` to `newName` within the same parent directory.
 * Rejects if the new name is invalid or the target already exists.
 * Returns the new absolute path.
 */
export async function renamePath(oldPath: string, newName: string): Promise<string> {
  if (!isValidEntryName(newName)) {
    throw new Error(`Invalid name: "${newName}"`)
  }
  const newPath = renamedPath(oldPath, newName)
  if (newPath !== oldPath && (await pathExists(newPath))) {
    throw new Error(`A file or folder named "${newName}" already exists.`)
  }
  await rename(oldPath, newPath)
  return newPath
}

/**
 * Duplicates the file at `srcPath` in the same directory. Uses the " copy"
 * suffix from {@link duplicatedPath}, then appends " copy 2", " copy 3" … until
 * it finds a free name (so repeated duplicates never overwrite). Returns the
 * new absolute path.
 */
export async function duplicatePath(srcPath: string): Promise<string> {
  const ext = extname(srcPath)
  const base = basename(srcPath, ext)
  const dir = dirname(srcPath)

  let candidate = duplicatedPath(srcPath)
  let n = 2
  while (await pathExists(candidate)) {
    candidate = join(dir, `${base} copy ${n}${ext}`)
    n++
  }
  await copyFile(srcPath, candidate)
  return candidate
}

/**
 * The destination path when moving `srcPath` into `destDir` (keeps the file's
 * basename). Pure helper for {@link movePath}.
 */
export function movedPath(srcPath: string, destDir: string): string {
  return join(destDir, basename(srcPath))
}

/**
 * Moves the file at `srcPath` into `destDir`, keeping its name. No-ops (returns
 * srcPath) when the destination equals the source. Rejects if a file with the
 * same name already exists in `destDir`. Returns the new absolute path.
 */
export async function movePath(srcPath: string, destDir: string): Promise<string> {
  const dest = movedPath(srcPath, destDir)
  if (dest === srcPath) return srcPath
  if (await pathExists(dest)) {
    throw new Error(
      `A file named "${basename(srcPath)}" already exists in the destination.`,
    )
  }
  await rename(srcPath, dest)
  return dest
}

/**
 * Moves `path` to the OS trash. Uses shell.trashItem (RECOVERABLE) rather than
 * a permanent fs.rm - sidebar deletes must be reversible from the system trash.
 */
export async function deletePath(path: string): Promise<void> {
  await shell.trashItem(path)
}

/** Reveals `path` in the OS file manager (Finder / Explorer). */
export function revealPath(path: string): void {
  shell.showItemInFolder(path)
}
