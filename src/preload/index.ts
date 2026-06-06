import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { LekhaAPI } from './api'
import type { FileNode, Settings, DocumentState } from '@shared/types'
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

  // --- Filesystem ---
  readFile(path: string): Promise<string> {
    return ipcRenderer.invoke(IPC.readFile, path) as Promise<string>
  },

  writeFile(path: string, content: string): Promise<void> {
    return ipcRenderer.invoke(IPC.writeFile, path, content) as Promise<void>
  },

  readDir(dir: string): Promise<FileNode[]> {
    return ipcRenderer.invoke(IPC.readDir, dir) as Promise<FileNode[]>
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

  // Open a new, independent editor window. Fire-and-forget: main creates the
  // window. Used by the 'newWindow' AppCommand (renderer-routed path); the
  // native menu item opens windows directly in main without this round-trip.
  newWindow(): void {
    ipcRenderer.send(IPC.newWindow)
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

  // Subscribes to set-theme messages from main (Theme menu).
  // Returns an unsubscribe function for cleanup on unmount.
  onSetTheme(cb: (id: string) => void): () => void {
    const listener = (_event: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on(IPC.setTheme, listener)
    return () => ipcRenderer.removeListener(IPC.setTheme, listener)
  },

  // --- Export ---
  exportHtml(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportHtml, args) as Promise<void>
  },

  exportPdf(args: { html: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportPdf, args) as Promise<void>
  },

  exportDocx(args: { markdown: string; suggestedName: string }): Promise<void> {
    return ipcRenderer.invoke(IPC.exportDocx, args) as Promise<void>
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
}

contextBridge.exposeInMainWorld('lekha', Object.freeze(api))
