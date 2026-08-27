/**
 * fileHandles.ts - the web adapter's file layer.
 *
 * The desktop app addresses documents by absolute filesystem path. The browser
 * has no such paths, so the web adapter uses a small set of synthetic "path"
 * schemes that flow unchanged through the existing renderer (open -> read ->
 * save), each backed by a real browser object held in a session registry:
 *
 *   fsa:<id>            - a File System Access file handle (real local file,
 *                         read + write; Chromium only).
 *   mem:<id>            - an in-memory File (drag-drop / <input> fallback;
 *                         read-only, "save" downloads a copy).
 *   fsdir:<id>::<rel>   - an entry inside an opened directory handle.
 *   http(s)://...       - a remote document (handled by the GitHub/url layer).
 *
 * basename() in @shared/pathTitle splits on "/", so every scheme ends in the
 * file's real name and the tab title comes out correct for free.
 */
import type { FileNode } from '@shared/types'

// FS Access API surfaces that predate/exceed the ambient lib types. Kept in one
// place and cast narrowly so the rest of the file stays typed.
interface PickerWindow {
  showOpenFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle[]>
  showSaveFilePicker?: (opts?: unknown) => Promise<FileSystemFileHandle>
  showDirectoryPicker?: (opts?: unknown) => Promise<FileSystemDirectoryHandle>
}
type PermHandle = {
  queryPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (d: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
}

export function pickerWindow(): PickerWindow {
  return window as unknown as PickerWindow
}
export function supportsFsAccess(): boolean {
  return typeof pickerWindow().showOpenFilePicker === 'function'
}
export function supportsDirectoryPicker(): boolean {
  return typeof pickerWindow().showDirectoryPicker === 'function'
}

// ---------------------------------------------------------------------------
// Session registries (not persisted: handles need a fresh permission grant
// after a reload anyway, so keeping them in memory keeps the model honest).
// ---------------------------------------------------------------------------
const fileHandles = new Map<string, FileSystemFileHandle>()
const memFiles = new Map<string, File>()
const dirHandles = new Map<string, FileSystemDirectoryHandle>()

let counter = 0
const nextId = (): string => `${Date.now().toString(36)}-${(counter++).toString(36)}`

export function registerFileHandle(handle: FileSystemFileHandle): string {
  const id = nextId()
  fileHandles.set(id, handle)
  return `fsa:${id}`
}
export function registerMemFile(file: File): string {
  const id = nextId()
  memFiles.set(id, file)
  return `mem:${id}`
}
export function registerDir(handle: FileSystemDirectoryHandle): string {
  const id = nextId()
  dirHandles.set(id, handle)
  return `fsdir:${id}::`
}

export function isRemotePath(path: string): boolean {
  return /^https?:\/\//i.test(path)
}

// ---------------------------------------------------------------------------
// Directory-path helpers: fsdir:<id>::<rel>
// ---------------------------------------------------------------------------
function parseDirPath(path: string): { id: string; rel: string } | null {
  const m = /^fsdir:([^:]+)::(.*)$/.exec(path)
  if (!m) return null
  return { id: m[1]!, rel: m[2]! }
}

async function resolveDirEntry(
  dir: FileSystemDirectoryHandle,
  rel: string,
): Promise<{ parent: FileSystemDirectoryHandle; name: string } | null> {
  const segments = rel.split('/').filter(Boolean)
  if (segments.length === 0) return null
  let cur = dir
  for (let i = 0; i < segments.length - 1; i++) {
    cur = await cur.getDirectoryHandle(segments[i]!)
  }
  return { parent: cur, name: segments[segments.length - 1]! }
}

async function ensurePermission(handle: PermHandle, mode: 'read' | 'readwrite'): Promise<void> {
  if (typeof handle.queryPermission !== 'function') return // permissions API absent -> assume granted
  const state = await handle.queryPermission({ mode })
  if (state === 'granted') return
  const req = await handle.requestPermission?.({ mode })
  if (req !== 'granted') throw new Error('Permission to access this file was not granted.')
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------
export async function readLocalFile(path: string): Promise<string> {
  if (path.startsWith('fsa:')) {
    const handle = fileHandles.get(path.slice(4))
    if (!handle) throw new Error('This file is no longer open. Re-open it from your computer.')
    await ensurePermission(handle as PermHandle, 'read')
    return (await handle.getFile()).text()
  }
  if (path.startsWith('mem:')) {
    const file = memFiles.get(path.slice(4))
    if (!file) throw new Error('This dropped file is no longer available.')
    return file.text()
  }
  const parsed = parseDirPath(path)
  if (parsed) {
    const dir = dirHandles.get(parsed.id)
    if (!dir) throw new Error('This folder is no longer open.')
    const entry = await resolveDirEntry(dir, parsed.rel)
    if (!entry) throw new Error('Invalid folder path.')
    const handle = await entry.parent.getFileHandle(entry.name)
    return (await handle.getFile()).text()
  }
  throw new Error(`Cannot read "${path}".`)
}

/** Return the underlying File for a local synthetic path (for size/mtime). */
export async function getLocalFile(path: string): Promise<File | null> {
  try {
    if (path.startsWith('fsa:')) {
      const handle = fileHandles.get(path.slice(4))
      return handle ? await handle.getFile() : null
    }
    if (path.startsWith('mem:')) {
      return memFiles.get(path.slice(4)) ?? null
    }
    const parsed = parseDirPath(path)
    if (parsed) {
      const dir = dirHandles.get(parsed.id)
      if (!dir) return null
      const entry = await resolveDirEntry(dir, parsed.rel)
      if (!entry) return null
      return await (await entry.parent.getFileHandle(entry.name)).getFile()
    }
  } catch {
    return null
  }
  return null
}

export async function writeLocalFile(path: string, content: string): Promise<void> {
  if (path.startsWith('fsa:')) {
    const handle = fileHandles.get(path.slice(4))
    if (!handle) throw new Error('This file is no longer open. Use Save As to choose a location.')
    await ensurePermission(handle as PermHandle, 'readwrite')
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return
  }
  const parsed = parseDirPath(path)
  if (parsed) {
    const dir = dirHandles.get(parsed.id)
    if (!dir) throw new Error('This folder is no longer open.')
    await ensurePermission(dir as unknown as PermHandle, 'readwrite')
    const entry = await resolveDirEntry(dir, parsed.rel)
    if (!entry) throw new Error('Invalid folder path.')
    const handle = await entry.parent.getFileHandle(entry.name, { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    return
  }
  // mem: / download: / remote -> hand back to the caller to download instead.
  throw new Error('NOT_WRITABLE')
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadText(filename: string, content: string, mime = 'text/markdown'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------
// Directory listing (lazy: immediate children only, matching the desktop tree)
// ---------------------------------------------------------------------------
interface AsyncDirEntries {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>
}

export async function readDirChildren(dirPath: string): Promise<FileNode[]> {
  const parsed = parseDirPath(dirPath)
  if (!parsed) throw new Error('Not a folder path.')
  const root = dirHandles.get(parsed.id)
  if (!root) throw new Error('This folder is no longer open.')
  const dir =
    parsed.rel === ''
      ? root
      : await (async () => {
          let cur = root
          for (const seg of parsed.rel.split('/').filter(Boolean)) {
            cur = await cur.getDirectoryHandle(seg)
          }
          return cur
        })()

  const nodes: FileNode[] = []
  const iter = (dir as unknown as AsyncDirEntries).entries()
  for await (const [name, handle] of iter) {
    if (name.startsWith('.')) continue // hide dotfiles, mirroring typical editors
    const rel = parsed.rel === '' ? name : `${parsed.rel}/${name}`
    nodes.push({
      name,
      path: `fsdir:${parsed.id}::${rel}`,
      isDirectory: handle.kind === 'directory',
    })
  }
  nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

// ---------------------------------------------------------------------------
// Directory mutations (Chromium File System Access). Files are fully supported;
// directory rename/move/duplicate reject with a clear message rather than doing
// something surprising, since the API has no atomic move.
// ---------------------------------------------------------------------------
function dirById(id: string): FileSystemDirectoryHandle {
  const dir = dirHandles.get(id)
  if (!dir) throw new Error('This folder is no longer open.')
  return dir
}
function joinRel(rel: string, name: string): string {
  return rel === '' ? name : `${rel}/${name}`
}
function relParent(rel: string): string {
  const segs = rel.split('/').filter(Boolean)
  segs.pop()
  return segs.join('/')
}

export async function createEntry(
  dirPath: string,
  name: string,
  kind: 'file' | 'folder',
): Promise<string> {
  const parsed = parseDirPath(dirPath)
  if (!parsed) throw new Error('Not a folder.')
  const dir = dirById(parsed.id)
  await ensurePermission(dir as unknown as PermHandle, 'readwrite')
  let target = dir
  for (const seg of parsed.rel.split('/').filter(Boolean)) {
    target = await target.getDirectoryHandle(seg)
  }
  const finalName = kind === 'file' && !/\.[^.]+$/.test(name) ? `${name}.md` : name
  if (kind === 'file') {
    await target.getFileHandle(finalName, { create: true })
  } else {
    await target.getDirectoryHandle(finalName, { create: true })
  }
  return `fsdir:${parsed.id}::${joinRel(parsed.rel, finalName)}`
}

export async function deleteEntry(path: string): Promise<void> {
  const parsed = parseDirPath(path)
  if (!parsed) throw new Error('Cannot delete this item on the web.')
  const dir = dirById(parsed.id)
  await ensurePermission(dir as unknown as PermHandle, 'readwrite')
  const entry = await resolveDirEntry(dir, parsed.rel)
  if (!entry) throw new Error('Invalid path.')
  await entry.parent.removeEntry(entry.name, { recursive: true })
}

async function copyFile(srcPath: string, destParentRel: string, destName: string): Promise<string> {
  const parsed = parseDirPath(srcPath)
  if (!parsed) throw new Error('Unsupported item.')
  const dir = dirById(parsed.id)
  const srcEntry = await resolveDirEntry(dir, parsed.rel)
  if (!srcEntry) throw new Error('Invalid path.')
  const srcHandle = await srcEntry.parent.getFileHandle(srcEntry.name)
  const content = await (await srcHandle.getFile()).text()

  let destDir = dir
  for (const seg of destParentRel.split('/').filter(Boolean)) {
    destDir = await destDir.getDirectoryHandle(seg)
  }
  await ensurePermission(destDir as unknown as PermHandle, 'readwrite')
  const destHandle = await destDir.getFileHandle(destName, { create: true })
  const writable = await destHandle.createWritable()
  await writable.write(content)
  await writable.close()
  return `fsdir:${parsed.id}::${joinRel(destParentRel, destName)}`
}

export async function renameEntry(path: string, newName: string): Promise<string> {
  const parsed = parseDirPath(path)
  if (!parsed) throw new Error('Cannot rename this item on the web.')
  const dir = dirById(parsed.id)
  const entry = await resolveDirEntry(dir, parsed.rel)
  if (!entry) throw new Error('Invalid path.')
  // Directories have no atomic rename in the API; refuse rather than deep-copy.
  const isDir = await entry.parent
    .getDirectoryHandle(entry.name)
    .then(() => true)
    .catch(() => false)
  if (isDir) throw new Error('Renaming folders is not supported in the web version yet.')
  const newPath = await copyFile(path, relParent(parsed.rel), newName)
  await deleteEntry(path)
  return newPath
}

export async function duplicateEntry(path: string): Promise<string> {
  const parsed = parseDirPath(path)
  if (!parsed) throw new Error('Cannot duplicate this item on the web.')
  const name = parsed.rel.split('/').pop() ?? 'file'
  const dot = name.lastIndexOf('.')
  const copyName = dot > 0 ? `${name.slice(0, dot)} copy${name.slice(dot)}` : `${name} copy`
  return copyFile(path, relParent(parsed.rel), copyName)
}

export async function moveEntry(srcPath: string, destDirPath: string): Promise<string> {
  const srcParsed = parseDirPath(srcPath)
  const destParsed = parseDirPath(destDirPath)
  if (!srcParsed || !destParsed || srcParsed.id !== destParsed.id) {
    throw new Error('Files can only be moved within the same open folder.')
  }
  const name = srcParsed.rel.split('/').pop() ?? 'file'
  const newPath = await copyFile(srcPath, destParsed.rel, name)
  await deleteEntry(srcPath)
  return newPath
}

/** Recursively collect markdown file paths under a directory path (capped). */
export async function walkMarkdown(
  dirPath: string,
  cap = 2000,
): Promise<Array<{ path: string; name: string }>> {
  const out: Array<{ path: string; name: string }> = []
  const parsed = parseDirPath(dirPath)
  if (!parsed) return out
  const root = dirHandles.get(parsed.id)
  if (!root) return out

  async function recurse(dir: FileSystemDirectoryHandle, rel: string): Promise<void> {
    if (out.length >= cap) return
    const iter = (dir as unknown as AsyncDirEntries).entries()
    for await (const [name, handle] of iter) {
      if (name.startsWith('.')) continue
      const childRel = rel === '' ? name : `${rel}/${name}`
      if (handle.kind === 'directory') {
        await recurse(handle as FileSystemDirectoryHandle, childRel)
      } else if (/\.(md|markdown|mdown|mkd|mdx|txt|text)$/i.test(name)) {
        out.push({ path: `fsdir:${parsed!.id}::${childRel}`, name })
        if (out.length >= cap) return
      }
    }
  }
  await recurse(root, parsed.rel)
  return out
}
