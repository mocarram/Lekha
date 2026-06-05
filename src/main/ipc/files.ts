import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { Settings } from '@shared/types'
import type { SettingsStore } from '@main/settings'
import { readTextFile, writeFileAtomic, buildFileTree } from '@main/fs-helpers'

/** Wraps an async handler so filesystem errors surface as clean Error messages
 *  rather than crashing the main process. */
function safeHandle<T>(
  channel: string,
  handler: (...args: unknown[]) => Promise<T>,
): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await handler(...args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(msg, { cause: err })
    }
  })
}

/**
 * Registers IPC handlers for filesystem and settings operations.
 * Also handles the window document-state update (title bar, dirty dot, represented file).
 */
export function registerFileHandlers(
  settings: SettingsStore,
  getWindow: () => BrowserWindow | null,
): void {
  // --- Filesystem ---

  safeHandle(IPC.readFile, async (path) => {
    return readTextFile(String(path))
  })

  safeHandle(IPC.writeFile, async (path, content) => {
    await writeFileAtomic(String(path), String(content))
  })

  safeHandle(IPC.readDir, async (dir) => {
    return buildFileTree(String(dir))
  })

  // --- Settings ---

  ipcMain.handle(IPC.getSettings, () => settings.get())

  ipcMain.handle(IPC.setSettings, (_event, patch: Partial<Settings>) =>
    settings.set(patch),
  )

  ipcMain.handle(IPC.getRecentFiles, () => settings.getRecentFiles())

  ipcMain.handle(IPC.addRecentFile, (_event, path: string) =>
    settings.addRecentFile(path),
  )

  // --- Window document state ---
  // Renderer sends { title, dirty, path } to update the title bar decoration.
  // On macOS, setRepresentedFilename drives the proxy icon in the title bar;
  // setDocumentEdited controls the • dot on the window close button.
  ipcMain.on(
    IPC.setDocumentState,
    (_event, state: { title: string; dirty: boolean; path: string | null }) => {
      const win = getWindow()
      if (!win) return
      win.setTitle(`${state.dirty ? '• ' : ''}${state.title}`)
      if (process.platform === 'darwin') {
        win.setRepresentedFilename(state.path ?? '')
        win.setDocumentEdited(state.dirty)
      }
    },
  )
}
