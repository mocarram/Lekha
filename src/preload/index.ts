import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { LekhaAPI } from './api'
import type {
  FileNode,
  FileStat,
  OpenFileStatus,
  ArticleEntry,
  Settings,
  DocumentState,
  FolderSearchResult,
  PandocFormat,
  Template,
  UserTheme,
  BackupRecord,
} from '@shared/types'
import type { AppCommand } from '@shared/commands'

const api: LekhaAPI = {
  // --- Dialogs ---
  openFileDialog(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.openFileDialog) as Promise<string | null>
  },

  openFolderDialog(): Promise<string | null> {
    return ipcRenderer.invoke(IPC.openFolderDialog) as Promise<string | null>
  },

  saveAsDialog(suggestedName?: string): Promise<string | null> {
    return ipcRenderer.invoke(IPC.saveAsDialog, suggestedName) as Promise<string | null>
  },

  confirmUnsaved(): Promise<'save' | 'dontSave' | 'cancel'> {
    return ipcRenderer.invoke(IPC.confirmUnsaved) as Promise<'save' | 'dontSave' | 'cancel'>
  },

  confirmReplace(detail: string): Promise<boolean> {
    return ipcRenderer.invoke(IPC.confirmReplace, detail) as Promise<boolean>
  },

  // --- Filesystem ---
  readFile(path: string): Promise<string> {
    return ipcRenderer.invoke(IPC.readFile, path) as Promise<string>
  },

  statFile(path: string): Promise<FileStat> {
    return ipcRenderer.invoke(IPC.statFile, path) as Promise<FileStat>
  },
  // Resolve the absolute filesystem path of a dropped/selected File. File.path
  // was removed in modern Electron; webUtils.getPathForFile is the supported
  // replacement and must run in the preload (it is not exposed to the sandbox).
  //
  // A non-empty result proves the File is a real OS-backed drop (a synthetic
  // File yields ''), i.e. genuine user intent - so register the path with the
  // main-process path policy here. This is what authorizes the subsequent
  // readFile/readDir for drag-and-dropped files and folders.
  getPathForFile(file: File): string {
    const path = webUtils.getPathForFile(file)
    if (path) ipcRenderer.send(IPC.permitDroppedPath, path)
    return path
  },
  verifyOpenFile(args: { path: string; inode: number }): Promise<OpenFileStatus> {
    return ipcRenderer.invoke(IPC.verifyOpenFile, args) as Promise<OpenFileStatus>
  },

  writeFile(path: string, content: string): Promise<void> {
    return ipcRenderer.invoke(IPC.writeFile, path, content) as Promise<void>
  },

  readDir(dir: string): Promise<FileNode[]> {
    return ipcRenderer.invoke(IPC.readDir, dir) as Promise<FileNode[]>
  },

  listArticles(root: string): Promise<ArticleEntry[]> {
    return ipcRenderer.invoke(IPC.listArticles, root) as Promise<ArticleEntry[]>
  },

  // --- File-tree entry operations ---
  createFile(dir: string, name: string): Promise<string> {
    return ipcRenderer.invoke(IPC.createFile, dir, name) as Promise<string>
  },

  createFolder(dir: string, name: string): Promise<string> {
    return ipcRenderer.invoke(IPC.createFolder, dir, name) as Promise<string>
  },

  renamePath(oldPath: string, newName: string): Promise<string> {
    return ipcRenderer.invoke(IPC.renamePath, oldPath, newName) as Promise<string>
  },

  duplicatePath(path: string): Promise<string> {
    return ipcRenderer.invoke(IPC.duplicatePath, path) as Promise<string>
  },

  movePath(srcPath: string, destDir: string): Promise<string> {
    return ipcRenderer.invoke(IPC.movePath, srcPath, destDir) as Promise<string>
  },

  deletePath(path: string): Promise<void> {
    return ipcRenderer.invoke(IPC.deletePath, path) as Promise<void>
  },

  revealPath(path: string): Promise<void> {
    return ipcRenderer.invoke(IPC.revealPath, path) as Promise<void>
  },

  // --- Settings ---
  getSettings(): Promise<Settings> {
    return ipcRenderer.invoke(IPC.getSettings) as Promise<Settings>
  },

  setSettings(patch: Partial<Settings>): Promise<Settings> {
    return ipcRenderer.invoke(IPC.setSettings, patch) as Promise<Settings>
  },

  getRecentFiles(): Promise<string[]> {
    return ipcRenderer.invoke(IPC.getRecentFiles) as Promise<string[]>
  },

  addRecentFile(path: string): Promise<void> {
    return ipcRenderer.invoke(IPC.addRecentFile, path) as Promise<void>
  },

  // --- Window state ---
  // Uses send (fire-and-forget) because no return value is expected.
  setDocumentState(state: DocumentState): void {
    ipcRenderer.send(IPC.setDocumentState, state)
  },

  setWindowDirty(anyDirty: boolean): void {
    ipcRenderer.send(IPC.setWindowDirty, anyDirty)
  },

  // Open a new, independent editor window. Fire-and-forget: main creates the
  // window. Used by the 'newWindow' AppCommand (renderer-routed path); the
  // native menu item opens windows directly in main without this round-trip.
  newWindow(): void {
    ipcRenderer.send(IPC.newWindow)
  },

  print(): void {
    ipcRenderer.send(IPC.print)
  },

  share(path: string): void {
    ipcRenderer.send(IPC.share, path)
  },

  setAlwaysOnTop(value: boolean): void {
    ipcRenderer.send(IPC.setAlwaysOnTop, value)
  },

  // --- Commands from main ---
  // Subscribes to broadcast commands (e.g. menu items) and returns an unsubscribe
  // function so the renderer can clean up on unmount.
  onCommand(cb: (cmd: AppCommand) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, cmd: AppCommand) => cb(cmd)
    ipcRenderer.on(IPC.command, listener)
    return () => ipcRenderer.removeListener(IPC.command, listener)
  },

  // Subscribes to open-path messages from main (Open Recent menu).
  // Returns an unsubscribe function for cleanup on unmount.
  onOpenPath(cb: (path: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, path: string) => cb(path)
    ipcRenderer.on(IPC.openPath, listener)
    return () => ipcRenderer.removeListener(IPC.openPath, listener)
  },

  // Drains the launch-open queue: files the OS asked Lekha to open before any
  // window existed ("Open With"/double-click on macOS, a CLI arg on Win/Linux).
  // Called once on mount; the queue is cleared by the read.
  takePendingOpen(): Promise<string[]> {
    return ipcRenderer.invoke(IPC.takePendingOpen) as Promise<string[]>
  },

  // True exactly once per app run (for the FIRST window): this window owns the
  // session restore (previous tabs + crash recovery). Later windows (File >
  // New Window) get false and start blank.
  shouldRestoreSession(): Promise<boolean> {
    return ipcRenderer.invoke(IPC.shouldRestoreSession) as Promise<boolean>
  },

  // Subscribes to set-theme messages from main (Theme menu).
  // Returns an unsubscribe function for cleanup on unmount.
  onSetTheme(cb: (id: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on(IPC.setTheme, listener)
    return () => ipcRenderer.removeListener(IPC.setTheme, listener)
  },

  // Subscribes to set-auto-save messages from main (File ▸ Auto Save menu item).
  // Returns an unsubscribe function for cleanup on unmount.
  onSetAutoSave(cb: (value: boolean) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean) => cb(value)
    ipcRenderer.on(IPC.setAutoSave, listener)
    return () => ipcRenderer.removeListener(IPC.setAutoSave, listener)
  },

  // --- Crash-recovery backups ---
  writeBackup(record: BackupRecord): Promise<void> {
    return ipcRenderer.invoke(IPC.backupWrite, record) as Promise<void>
  },

  deleteBackup(backupId: string): Promise<void> {
    return ipcRenderer.invoke(IPC.backupDelete, backupId) as Promise<void>
  },

  listBackups(): Promise<BackupRecord[]> {
    return ipcRenderer.invoke(IPC.backupList) as Promise<BackupRecord[]>
  },

  // --- Export ---
  exportHtml(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportHtml, args) as Promise<void>
  },

  exportPdf(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportPdf, args) as Promise<void>
  },

  exportPandoc(args: {
    markdown: string
    suggestedName: string
    format: PandocFormat
  }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportPandoc, args) as Promise<void>
  },

  pandocAvailable(): Promise<boolean> {
    return ipcRenderer.invoke(IPC.pandocAvailable) as Promise<boolean>
  },

  saveImage(args: { data: ArrayBuffer; ext: string; docPath: string | null }): Promise<{ insertPath: string }> {
    return ipcRenderer.invoke(IPC.saveImage, args) as Promise<{ insertPath: string }>
  },

  // --- Shell ---
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke(IPC.openExternal, url) as Promise<void>
  },

  // --- Clipboard ---
  writeClipboard(args: { text?: string; html?: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.writeClipboard, args) as Promise<void>
  },

  readClipboardText(): Promise<string> {
    return ipcRenderer.invoke(IPC.readClipboardText) as Promise<string>
  },

  // --- Folder search ---
  searchFolder(args: { root: string; query: string; caseSensitive: boolean; wholeWord: boolean }): Promise<FolderSearchResult[]> {
    return ipcRenderer.invoke(IPC.searchFolder, args) as Promise<FolderSearchResult[]>
  },

  replaceInFolder(args: {
    root: string
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    skipPaths: string[]
    /** Count what would change without writing (drives the confirm dialog). */
    dryRun?: boolean
  }): Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }> {
    return ipcRenderer.invoke(IPC.replaceInFolder, args) as Promise<{
      filesChanged: number
      replacements: number
      changedPaths: string[]
    }>
  },

  // --- Templates ---
  listTemplates(): Promise<Template[]> {
    return ipcRenderer.invoke(IPC.listTemplates) as Promise<Template[]>
  },

  // --- User themes ---
  listThemes(): Promise<UserTheme[]> {
    return ipcRenderer.invoke(IPC.listThemes) as Promise<UserTheme[]>
  },
  reloadThemes(): Promise<UserTheme[]> {
    return ipcRenderer.invoke(IPC.reloadThemes) as Promise<UserTheme[]>
  },
  openThemeFolder(): Promise<void> {
    return ipcRenderer.invoke(IPC.openThemeFolder) as Promise<void>
  },
}

contextBridge.exposeInMainWorld('lekha', Object.freeze(api))
