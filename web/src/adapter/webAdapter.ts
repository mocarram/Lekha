/**
 * webAdapter.ts - a browser implementation of LekhaAPI (window.lekha).
 *
 * The desktop app implements this interface over Electron IPC to the OS. The
 * web app implements the same interface over browser APIs: the File System
 * Access API for real local files and folders, IndexedDB for settings / recent
 * / crash backups, fetch for remote (GitHub) documents, and DOM APIs for
 * clipboard, export downloads, and printing. Because the renderer only ever
 * talks to window.lekha, installing this makes the entire editor run in a tab
 * with no changes to editor code.
 *
 * Capabilities the browser has no equivalent for (folder watching, pandoc
 * export, always-on-top, OS reveal) degrade to a no-op or a clear message,
 * matching the plan's "hide what the web can't do rather than fake it".
 */
// LekhaAPI declares every method as Promise-returning (it is IPC on the
// desktop). Several web implementations are trivially synchronous but must keep
// that async signature to satisfy the interface, so require-await is off here.
/* eslint-disable @typescript-eslint/require-await */
import type { LekhaAPI } from '../../../src/preload/api'
import type {
  Settings,
  FileStat,
  FileNode,
  OpenFileStatus,
  ArticleEntry,
  DocumentState,
  FolderSearchResult,
  Template,
  UserTheme,
  BackupRecord,
} from '@shared/types'
import { DEFAULT_FONT_SIZE } from '@shared/types'
import type { UpdateChannel, UpdateCheckResult } from '@shared/updateChannel'
import { idbGet, idbSet, idbDelete, idbGetAll } from './idb'
import {
  supportsFsAccess,
  supportsDirectoryPicker,
  pickerWindow,
  registerFileHandle,
  registerMemFile,
  registerDir,
  readLocalFile,
  writeLocalFile,
  getLocalFile,
  readDirChildren,
  walkMarkdown,
  downloadText,
  createEntry,
  deleteEntry,
  renameEntry,
  duplicateEntry,
  moveEntry,
  isRemotePath,
} from './fileHandles'
import { fetchRemote } from './github'
import { onCommand as busOnCommand } from '../commandBus'

export const WEB_VERSION = '0.2.0-web'

// ---------------------------------------------------------------------------
// Settings (IndexedDB, one row)
// ---------------------------------------------------------------------------
const SETTINGS_KEY = 'settings'
const MAX_RECENT = 15

const DEFAULT_SETTINGS: Settings = {
  recentFiles: [],
  lastFolder: null,
  sidebarVisible: true,
  sidebarTab: 'files',
  theme: 'midnight',
  focusMode: false,
  typewriterMode: false,
  equationNumbering: true,
  fontSize: DEFAULT_FONT_SIZE,
  autoSave: false,
  spellCheck: true,
  spellCheckLanguage: 'en-US',
  smartPunctuation: true,
  sidebarWidth: 240,
  openTabPaths: [],
  activeTabPath: null,
  pinnedTabPaths: [],
  zoomFactor: 1,
  folderColors: {},
}

async function loadSettings(): Promise<Settings> {
  const stored = await idbGet<Partial<Settings>>('settings', SETTINGS_KEY).catch(() => undefined)
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}
async function saveSettings(next: Settings): Promise<void> {
  await idbSet('settings', SETTINGS_KEY, next)
}

// ---------------------------------------------------------------------------
// Launch-open queue (populated by install.ts from the URL router)
// ---------------------------------------------------------------------------
let pendingOpen: string[] = []
export function setPendingOpen(paths: string[]): void {
  pendingOpen = paths
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function pickFallbackInput(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
      input.remove()
    })
    // If the user cancels there is no reliable event; a focus-based fallback
    // resolves null so callers never hang.
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => resolve(input.files?.[0] ?? null), 300)
      },
      { once: true },
    )
    document.body.appendChild(input)
    input.click()
  })
}

const MD_ACCEPT = '.md,.markdown,.mdown,.mkd,.mdx,.txt,.text'
const MD_PICKER_TYPES = [
  {
    description: 'Markdown & text',
    accept: {
      'text/markdown': ['.md', '.markdown', '.mdown', '.mkd', '.mdx'],
      'text/plain': ['.txt', '.text'],
    },
  },
]

function printHtml(html: string): void {
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const win = iframe.contentWindow
  const cleanup = (): void => {
    setTimeout(() => iframe.remove(), 500)
  }
  win.addEventListener('afterprint', cleanup, { once: true })
  // Give images/KaTeX a tick to lay out before printing.
  setTimeout(() => {
    win.focus()
    win.print()
    cleanup()
  }, 250)
}

// beforeunload guard toggled by setWindowDirty
let beforeUnload: ((e: BeforeUnloadEvent) => void) | null = null

let zoomFactor = 1

// ---------------------------------------------------------------------------
// The adapter
// ---------------------------------------------------------------------------
export const webAdapter: LekhaAPI = {
  // --- Dialogs ---
  async openFileDialog() {
    if (supportsFsAccess()) {
      try {
        const [handle] = await pickerWindow().showOpenFilePicker!({
          types: MD_PICKER_TYPES,
          multiple: false,
        })
        return handle ? registerFileHandle(handle) : null
      } catch {
        return null // user cancelled
      }
    }
    const file = await pickFallbackInput(MD_ACCEPT)
    return file ? registerMemFile(file) : null
  },

  async openFolderDialog() {
    if (!supportsDirectoryPicker()) {
      window.alert('Opening a folder requires a Chromium-based browser (Chrome, Edge, Brave, Arc).')
      return null
    }
    try {
      const handle = await pickerWindow().showDirectoryPicker!({ mode: 'readwrite' })
      return registerDir(handle)
    } catch {
      return null
    }
  },

  async saveAsDialog(suggestedName?: string) {
    const name = suggestedName ?? 'Untitled.md'
    if (supportsFsAccess()) {
      try {
        const handle = await pickerWindow().showSaveFilePicker!({
          suggestedName: name,
          types: MD_PICKER_TYPES,
        })
        return registerFileHandle(handle)
      } catch {
        return null
      }
    }
    // No picker: signal a plain download target. writeFile handles the scheme.
    return `download:${name}`
  },

  async confirmUnsaved() {
    if (
      window.confirm(
        'Save changes before closing this document?\n\nOK = Save, Cancel = choose next',
      )
    ) {
      return 'save'
    }
    return window.confirm('Discard your changes?\n\nOK = Discard, Cancel = keep editing')
      ? 'dontSave'
      : 'cancel'
  },

  async confirmReplace(detail: string) {
    return window.confirm(detail)
  },

  // --- Filesystem ---
  async readFile(path: string) {
    if (isRemotePath(path)) return fetchRemote(path)
    return readLocalFile(path)
  },

  async statFile(path: string): Promise<FileStat> {
    const file = isRemotePath(path) ? null : await getLocalFile(path)
    return {
      sizeBytes: file?.size ?? 0,
      birthtimeMs: 0,
      mtimeMs: file?.lastModified ?? 0,
      inode: 0,
    }
  },

  getPathForFile(file: File) {
    return registerMemFile(file)
  },

  async verifyOpenFile(_args: { path: string; inode: number }): Promise<OpenFileStatus> {
    return { status: 'present' }
  },

  async writeFile(path: string, content: string) {
    if (path.startsWith('download:')) {
      downloadText(path.slice('download:'.length), content)
      return
    }
    if (isRemotePath(path) || path.startsWith('mem:')) {
      // Remote/in-memory documents can't be written back in place; download.
      const name = path.split(/[/\\]/).pop() || 'document.md'
      downloadText(name, content)
      return
    }
    try {
      await writeLocalFile(path, content)
    } catch (err) {
      if (err instanceof Error && err.message === 'NOT_WRITABLE') {
        downloadText('document.md', content)
        return
      }
      throw err
    }
  },

  async readDir(dir: string): Promise<FileNode[]> {
    return readDirChildren(dir)
  },

  async watchFolder(_dir: string | null) {
    // No filesystem watcher in the browser; changes are picked up on re-open.
  },

  async listArticles(root: string): Promise<ArticleEntry[]> {
    const files = await walkMarkdown(root, 300)
    const entries: ArticleEntry[] = []
    for (const f of files) {
      try {
        const text = await readLocalFile(f.path)
        const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim()
        const preview = text
          .replace(/^#.*$/gm, '')
          .replace(/[`*_>#-]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 140)
        const file = await getLocalFile(f.path)
        entries.push({
          path: f.path,
          title: heading || f.name,
          mtimeMs: file?.lastModified ?? 0,
          sizeBytes: file?.size ?? text.length,
          preview,
        })
      } catch {
        // Skip unreadable files.
      }
    }
    entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return entries
  },

  // --- File-tree entry operations ---
  async createFile(dir: string, name: string) {
    return createEntry(dir, name, 'file')
  },
  async createFolder(dir: string, name: string) {
    return createEntry(dir, name, 'folder')
  },
  async renamePath(oldPath: string, newName: string) {
    return renameEntry(oldPath, newName)
  },
  async duplicatePath(path: string) {
    return duplicateEntry(path)
  },
  async movePath(srcPath: string, destDir: string) {
    return moveEntry(srcPath, destDir)
  },
  async deletePath(path: string) {
    return deleteEntry(path)
  },
  async revealPath(_path: string) {
    // No OS file manager to reveal in.
  },

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    return loadSettings()
  },
  async setSettings(patch: Partial<Settings>): Promise<Settings> {
    const next = { ...(await loadSettings()), ...patch }
    await saveSettings(next)
    return next
  },
  async getRecentFiles(): Promise<string[]> {
    return (await loadSettings()).recentFiles
  },
  async addRecentFile(path: string) {
    // Only remember paths that can be re-opened after a reload (remote URLs).
    // Local file handles don't survive a reload, so recording them would give
    // a "recent" list full of dead entries.
    if (!isRemotePath(path)) return
    const s = await loadSettings()
    const recentFiles = [path, ...s.recentFiles.filter((p) => p !== path)].slice(0, MAX_RECENT)
    await saveSettings({ ...s, recentFiles })
  },

  // --- Window state ---
  setDocumentState(state: DocumentState) {
    document.title = `${state.dirty ? '• ' : ''}${state.title} — Lekha`
  },
  setWindowDirty(anyDirty: boolean) {
    if (anyDirty && !beforeUnload) {
      beforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault()
        e.returnValue = ''
      }
      window.addEventListener('beforeunload', beforeUnload)
    } else if (!anyDirty && beforeUnload) {
      window.removeEventListener('beforeunload', beforeUnload)
      beforeUnload = null
    }
  },
  newWindow() {
    window.open(window.location.origin, '_blank', 'noopener')
  },
  print() {
    window.print()
  },
  share(path: string) {
    const nav = navigator as Navigator & {
      share?: (d: { title?: string; text?: string }) => Promise<void>
    }
    void nav.share?.({ title: 'Lekha', text: path }).catch(() => {})
  },
  setAlwaysOnTop(_value: boolean) {
    // Not available to web pages.
  },

  // --- Commands from main ---
  onCommand(cb) {
    return busOnCommand(cb)
  },
  onOpenPath(_cb) {
    return () => {}
  },
  onFolderChanged(_cb) {
    return () => {}
  },
  onSetTheme(_cb) {
    return () => {}
  },
  onSetAutoSave(_cb) {
    return () => {}
  },

  async takePendingOpen(): Promise<string[]> {
    const paths = pendingOpen
    pendingOpen = []
    return paths
  },

  async shouldRestoreSession(): Promise<boolean> {
    return true
  },

  async adjustZoom(action: 'in' | 'out' | 'reset' | number): Promise<number> {
    if (typeof action === 'number') zoomFactor = action
    else if (action === 'in') zoomFactor += 0.1
    else if (action === 'out') zoomFactor -= 0.1
    else zoomFactor = 1
    zoomFactor = Math.min(3, Math.max(0.5, Math.round(zoomFactor * 100) / 100))
    document.documentElement.style.setProperty('zoom', String(zoomFactor))
    return zoomFactor
  },

  async checkForUpdates(): Promise<UpdateCheckResult> {
    return {
      channel: 'homebrew',
      currentVersion: WEB_VERSION,
      latestVersion: null,
      updateAvailable: false,
      error: false,
    }
  },

  async getAppInfo(): Promise<{ version: string; channel: UpdateChannel }> {
    return { version: WEB_VERSION, channel: 'homebrew' }
  },

  async setFolderColor(path: string, hex: string | null) {
    const s = await loadSettings()
    const folderColors = { ...s.folderColors }
    if (hex === null) delete folderColors[path]
    else folderColors[path] = hex
    await saveSettings({ ...s, folderColors })
  },

  // --- Crash-recovery backups (IndexedDB) ---
  async writeBackup(record: BackupRecord) {
    await idbSet('backups', record.backupId, { ...record, savedAt: Date.now() })
  },
  async deleteBackup(backupId: string) {
    await idbDelete('backups', backupId)
  },
  async listBackups(): Promise<BackupRecord[]> {
    return idbGetAll<BackupRecord>('backups').catch(() => [])
  },

  // --- Export ---
  async exportHtml(args: { html: string; suggestedName: string }) {
    downloadText(args.suggestedName, args.html, 'text/html')
  },
  async exportPdf(args: { html: string; suggestedName: string }) {
    // No headless PDF in the browser; render + invoke the print dialog so the
    // user can "Save as PDF". suggestedName is advisory (the browser names it).
    printHtml(args.html)
  },
  async exportPandoc(_args): Promise<void> {
    throw new Error('Pandoc export (docx/epub/rtf/latex) is not available in the web version.')
  },
  async pandocAvailable(): Promise<boolean> {
    return false
  },

  // --- Images ---
  async saveImage(args: { data: ArrayBuffer; ext: string; docPath: string | null }) {
    // Inline the image as a data URI - no server, works everywhere, and travels
    // with the document. (A later phase can store to OPFS for large images.)
    const bytes = new Uint8Array(args.data)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
    const mime =
      args.ext === 'svg' ? 'image/svg+xml' : `image/${args.ext === 'jpg' ? 'jpeg' : args.ext}`
    return { insertPath: `data:${mime};base64,${btoa(binary)}` }
  },

  // --- Shell ---
  async openExternal(url: string) {
    if (/^(https?|mailto):/i.test(url)) window.open(url, '_blank', 'noopener,noreferrer')
  },

  // --- Clipboard ---
  async writeClipboard(args: { text?: string; html?: string }) {
    try {
      if (args.html !== undefined && 'ClipboardItem' in window) {
        const item = new ClipboardItem({
          'text/html': new Blob([args.html], { type: 'text/html' }),
          'text/plain': new Blob([args.text ?? ''], { type: 'text/plain' }),
        })
        await navigator.clipboard.write([item])
      } else if (args.text !== undefined) {
        await navigator.clipboard.writeText(args.text)
      }
    } catch {
      // Clipboard may be blocked without a user gesture; ignore.
    }
  },
  async readClipboardText(): Promise<string> {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return ''
    }
  },

  // --- Folder search ---
  async searchFolder(args: {
    root: string
    query: string
    caseSensitive: boolean
    wholeWord: boolean
  }): Promise<FolderSearchResult[]> {
    if (args.query.length < 1) return []
    const files = await walkMarkdown(args.root, 1000)
    const flags = args.caseSensitive ? 'g' : 'gi'
    const escaped = args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = args.wholeWord ? `\\b${escaped}\\b` : escaped
    const results: FolderSearchResult[] = []
    for (const f of files) {
      try {
        const text = await readLocalFile(f.path)
        const lines = text.split(/\r?\n/)
        const matches = lines
          .map((lineText, i) => ({ lineNumber: i + 1, lineText }))
          .filter((l) => new RegExp(pattern, flags).test(l.lineText))
        if (matches.length > 0) results.push({ filePath: f.path, fileName: f.name, matches })
      } catch {
        // skip
      }
    }
    return results
  },

  async replaceInFolder(args: {
    root: string
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    skipPaths: string[]
    dryRun?: boolean
  }): Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }> {
    const files = await walkMarkdown(args.root, 1000)
    const flags = args.caseSensitive ? 'g' : 'gi'
    const escaped = args.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = args.wholeWord ? `\\b${escaped}\\b` : escaped
    const skip = new Set(args.skipPaths)
    let filesChanged = 0
    let replacements = 0
    const changedPaths: string[] = []
    for (const f of files) {
      if (skip.has(f.path)) continue
      try {
        const text = await readLocalFile(f.path)
        const re = new RegExp(pattern, flags)
        const count = (text.match(re) ?? []).length
        if (count === 0) continue
        replacements += count
        filesChanged++
        changedPaths.push(f.path)
        if (!args.dryRun) await writeLocalFile(f.path, text.replace(re, args.replacement))
      } catch {
        // skip
      }
    }
    return { filesChanged, replacements, changedPaths }
  },

  // --- Templates & user themes (none bundled for web v1) ---
  async listTemplates(): Promise<Template[]> {
    return []
  },
  async listThemes(): Promise<UserTheme[]> {
    return []
  },
  async reloadThemes(): Promise<UserTheme[]> {
    return []
  },
  async openThemeFolder(): Promise<void> {
    window.alert(
      'Custom theme files are a desktop feature. Built-in themes are available in Preferences.',
    )
  },
}
