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
}

contextBridge.exposeInMainWorld('lekha', Object.freeze(api))
