import { ipcMain, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import type { Settings } from '@shared/types'
import type { SettingsStore } from '@main/settings'
import type { WindowRegistry } from '@main/window'
import { formatWindowTitle } from '@main/windowTitle'
import { readTextFile, writeFileAtomic, buildFileTree, statFile, verifyOpenFile, listArticles } from '@main/fs-helpers'
import { writeBackup, deleteBackup, listBackups, isBackupRecord } from '@main/backups'
import {
  createFile,
  createFolder,
  renamePath,
  duplicatePath,
  movePath,
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
 * @param _registry          - The multi-window registry. Currently unused in
 *   this file: setDocumentState only updates the SENDER's window title bar +
 *   proxy icon, and the window-level edited dot / close-guard dirtiness moved to
 *   the setWindowDirty handler in index.ts. Kept in the signature (registered
 *   positionally from index.ts) so the wiring stays stable for future handlers.
 * @param onRecentAdded      - Optional callback invoked after a file is added to
 *   recents. The main process uses this to rebuild the Open Recent menu so it
 *   stays in sync with the persisted list without an extra IPC round-trip.
 *   The callback may be async (returning a Promise); the Promise is awaited
 *   inside the IPC handler which already runs in an async context.
 * @param onSettingsChanged  - Optional callback invoked after every setSettings
 *   call, receiving the full updated Settings. The main process uses this to
 *   rebuild the menu when the theme changes so the radio check stays current.
 *   The callback may be async (returning a Promise); the Promise is awaited.
 * @param getUserDataPath    - Required callable that returns the current
 *   userData directory path, used to resolve the crash-backup directory
 *   (`<userData>/backups`). Passed as a thunk - mirroring the image/template/
 *   theme handlers - so tests can inject a temp dir without a live Electron app.
 *   Required (not defaulted) so a dropped argument fails loudly rather than
 *   silently writing backups to a relative './backups' under the process cwd.
 */
export function registerFileHandlers(
  settings: SettingsStore,
  _registry: WindowRegistry,
  onRecentAdded: (() => Promise<void> | void) | undefined,
  onSettingsChanged: ((updated: Settings) => Promise<void> | void) | undefined,
  getUserDataPath: () => string,
): void {
  /** Resolve the crash-backup directory under the current userData path. */
  const backupsDir = (): string => join(getUserDataPath(), 'backups')

  // --- Filesystem ---

  safeHandle(IPC.readFile, async (path) => {
    return readTextFile(String(path))
  })

  safeHandle(IPC.statFile, async (path) => {
    return statFile(String(path))
  })

  safeHandle(IPC.verifyOpenFile, async (arg) => {
    const { path, inode } = arg as { path: string; inode: number }
    return verifyOpenFile(String(path), Number(inode))
  })

  safeHandle(IPC.writeFile, async (path, content) => {
    await writeFileAtomic(String(path), String(content))
  })

  safeHandle(IPC.listArticles, async (root) => {
    return listArticles(String(root))
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

  safeHandle(IPC.movePath, async (srcPath, destDir) => {
    return movePath(String(srcPath), String(destDir))
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

  // --- Crash-recovery backups ---
  // Always-on (independent of the autoSave setting): the renderer writes unsaved
  // buffers here so they survive a crash. Backups live in <userData>/backups and
  // never touch the user's real file. savedAt is stamped HERE (authoritative
  // main-process clock) so the renderer payload stays minimal and backups.ts
  // stays clock-free / pure-testable.

  safeHandle(IPC.backupWrite, async (record) => {
    // Stamp savedAt authoritatively, then validate the full record at the trust
    // boundary so a malformed renderer payload is rejected at write time rather
    // than silently dropped later by listBackups (a confusing no-op recovery).
    const stamped = { ...(record as Record<string, unknown>), savedAt: Date.now() }
    if (!isBackupRecord(stamped)) {
      throw new Error('Invalid backup record')
    }
    await writeBackup(backupsDir(), stamped)
  })

  safeHandle(IPC.backupDelete, async (backupId) => {
    await deleteBackup(backupsDir(), String(backupId))
  })

  safeHandle(IPC.backupList, async () => {
    return listBackups(backupsDir())
  })

  // --- Window document state ---
  // Renderer sends { title, dirty, path } to update the title bar decoration for
  // the ACTIVE document. Multi-window: the update targets the SENDER's window
  // (the one whose renderer reported the state), resolved via
  // BrowserWindow.fromWebContents, never a shared global window.
  //
  // This handler drives ONLY the active-doc title bullet (a per-document
  // indicator). The macOS edited dot and the close guard are
  // WINDOW-level (any open tab dirty) and driven separately by setWindowDirty -
  // a clean active tab must not clear the edited dot / guard while a background
  // tab is still dirty.
  // On macOS, setRepresentedFilename drives the proxy icon in the title bar.
  ipcMain.on(
    IPC.setDocumentState,
    (event, state: { title: string; dirty: boolean; path: string | null }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      const isMac = process.platform === 'darwin'
      win.setTitle(formatWindowTitle(state.title, state.dirty, isMac))
      if (isMac) {
        // Proxy icon (Cmd-click -> folder breadcrumb; drag to move).
        // setRepresentedFilename('') clears the proxy icon for an unsaved
        // (path-less) document.
        win.setRepresentedFilename(state.path ?? '')
      }
    },
  )
}
