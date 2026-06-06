import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { Settings } from '@shared/types'
import type { SettingsStore } from '@main/settings'
import type { WindowRegistry } from '@main/window'
import { readTextFile, writeFileAtomic, buildFileTree } from '@main/fs-helpers'
import {
  createFile,
  createFolder,
  renamePath,
  duplicatePath,
  deletePath,
  revealPath,
} from '@main/fileOps'

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
 *
 * @param registry           - The multi-window registry. setDocumentState
 *   updates the SENDER's window (title bar, proxy icon, edited dot) and its
 *   per-window close-guard dirty flag via the matching WindowController.
 * @param onRecentAdded      - Optional callback invoked after a file is added to
 *   recents. The main process uses this to rebuild the Open Recent menu so it
 *   stays in sync with the persisted list without an extra IPC round-trip.
 *   The callback may be async (returning a Promise); the Promise is awaited
 *   inside the IPC handler which already runs in an async context.
 * @param onSettingsChanged  - Optional callback invoked after every setSettings
 *   call, receiving the full updated Settings. The main process uses this to
 *   rebuild the menu when the theme changes so the radio check stays current.
 *   The callback may be async (returning a Promise); the Promise is awaited.
 */
export function registerFileHandlers(
  settings: SettingsStore,
  registry: WindowRegistry,
  onRecentAdded?: () => Promise<void> | void,
  onSettingsChanged?: (updated: Settings) => Promise<void> | void,
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

  // --- File-tree entry operations (create / rename / delete / reveal) ---
  // Name validation + path-safety live in fileOps.ts. deletePath uses
  // shell.trashItem (recoverable), never a permanent rm.

  safeHandle(IPC.createFile, async (dir, name) => {
    return createFile(String(dir), String(name))
  })

  safeHandle(IPC.createFolder, async (dir, name) => {
    return createFolder(String(dir), String(name))
  })

  safeHandle(IPC.renamePath, async (oldPath, newName) => {
    return renamePath(String(oldPath), String(newName))
  })

  safeHandle(IPC.duplicatePath, async (path) => {
    return duplicatePath(String(path))
  })

  safeHandle(IPC.deletePath, async (path) => {
    await deletePath(String(path))
  })

  // revealPath is synchronous (shell.showItemInFolder); wrap its result in a
  // resolved promise so it fits the async safeHandle contract.
  safeHandle(IPC.revealPath, (path) => {
    revealPath(String(path))
    return Promise.resolve()
  })

  // --- Settings ---
  // Routed through safeHandle for consistent clean-Error behavior on failure.

  safeHandle(IPC.getSettings, async () => settings.get())

  safeHandle(IPC.setSettings, async (patch) => {
    const updated = await settings.set(patch as Partial<Settings>)
    // Notify index.ts so it can rebuild the menu (e.g. to update the Theme
    // radio check) after the renderer persists a settings change.
    await onSettingsChanged?.(updated)
    return updated
  })

  safeHandle(IPC.getRecentFiles, async () => settings.getRecentFiles())

  safeHandle(IPC.addRecentFile, async (path) => {
    await settings.addRecentFile(String(path))
    // Notify the main process so it can rebuild the Open Recent menu.
    await onRecentAdded?.()
  })

  // --- Window document state ---
  // Renderer sends { title, dirty, path } to update the title bar decoration.
  // Multi-window: the update targets the SENDER's window (the one whose
  // renderer reported the state), resolved via BrowserWindow.fromWebContents,
  // never a shared global window.
  // On macOS, setRepresentedFilename drives the proxy icon in the title bar;
  // setDocumentEdited controls the • dot on the window close button.
  ipcMain.on(
    IPC.setDocumentState,
    (event, state: { title: string; dirty: boolean; path: string | null }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      win.setTitle(`${state.dirty ? '• ' : ''}${state.title}`)
      if (process.platform === 'darwin') {
        win.setRepresentedFilename(state.path ?? '')
        win.setDocumentEdited(state.dirty)
      }
      // Update THIS window's close-guard dirty flag (per-window state machine).
      registry.get(win)?.setDirty(state.dirty)
    },
  )
}
