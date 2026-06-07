import { ipcMain, BrowserWindow } from 'electron'
import { join, dirname } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { grantRoot, isPathAllowed } from '@main/permittedRoots'
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
 * @param getUserDataPath    - Required callable that returns the current
 *   userData directory path, used to resolve the crash-backup directory
 *   (`<userData>/backups`). Passed as a thunk - mirroring the image/template/
 *   theme handlers - so tests can inject a temp dir without a live Electron app.
 *   Required (not defaulted) so a dropped argument fails loudly rather than
 *   silently writing backups to a relative './backups' under the process cwd.
 */
export function registerFileHandlers(
  settings: SettingsStore,
  registry: WindowRegistry,
  onRecentAdded: (() => Promise<void> | void) | undefined,
  onSettingsChanged: ((updated: Settings) => Promise<void> | void) | undefined,
  getUserDataPath: () => string,
): void {
  /** Resolve the crash-backup directory under the current userData path. */
  const backupsDir = (): string => join(getUserDataPath(), 'backups')

  // --- Path confinement (security trust boundary) ---
  // Every handler below receives a renderer-supplied path. requireAllowed throws
  // a clean Error (surfaced via safeHandle) when the path was never granted, so a
  // compromised renderer cannot read/write/delete arbitrary disk paths. Grants
  // are seeded at startup (settings restore), by the dialog handlers, and by
  // addRecentFile. Allowed paths behave exactly as before.
  const requireAllowed = (path: string): void => {
    if (!isPathAllowed(path)) {
      throw new Error(`Access to path is not permitted: ${path}`)
    }
  }

  // --- Filesystem ---

  safeHandle(IPC.readFile, async (path) => {
    requireAllowed(String(path))
    return readTextFile(String(path))
  })

  safeHandle(IPC.statFile, async (path) => {
    requireAllowed(String(path))
    return statFile(String(path))
  })

  safeHandle(IPC.verifyOpenFile, async (arg) => {
    const { path, inode } = arg as { path: string; inode: number }
    requireAllowed(String(path))
    return verifyOpenFile(String(path), Number(inode))
  })

  safeHandle(IPC.writeFile, async (path, content) => {
    requireAllowed(String(path))
    await writeFileAtomic(String(path), String(content))
  })

  safeHandle(IPC.listArticles, async (root) => {
    requireAllowed(String(root))
    return listArticles(String(root))
  })

  safeHandle(IPC.readDir, async (dir) => {
    requireAllowed(String(dir))
    return buildFileTree(String(dir))
  })

  // --- File-tree entry operations (create / rename / delete / reveal) ---
  // Name validation + path-safety live in fileOps.ts. deletePath uses
  // shell.trashItem (recoverable), never a permanent rm.

  safeHandle(IPC.createFile, async (dir, name) => {
    // The new file's parent dir must be allowed (the file does not exist yet).
    requireAllowed(String(dir))
    return createFile(String(dir), String(name))
  })

  safeHandle(IPC.createFolder, async (dir, name) => {
    // The new folder's parent dir must be allowed (the folder does not exist yet).
    requireAllowed(String(dir))
    return createFolder(String(dir), String(name))
  })

  safeHandle(IPC.renamePath, async (oldPath, newName) => {
    // Both the existing path and its parent dir (where the rename lands) must be
    // covered. Checking the parent dir suffices since the target stays in place.
    requireAllowed(String(oldPath))
    requireAllowed(dirname(String(oldPath)))
    return renamePath(String(oldPath), String(newName))
  })

  safeHandle(IPC.duplicatePath, async (path) => {
    // The copy lands beside the source, so the source path being allowed (which
    // implies its containing dir is granted for any tree/folder-derived path)
    // covers the destination.
    requireAllowed(String(path))
    return duplicatePath(String(path))
  })

  safeHandle(IPC.movePath, async (srcPath, destDir) => {
    // A move reads from srcPath and writes into destDir - BOTH must be allowed.
    requireAllowed(String(srcPath))
    requireAllowed(String(destDir))
    return movePath(String(srcPath), String(destDir))
  })

  safeHandle(IPC.deletePath, async (path) => {
    requireAllowed(String(path))
    await deletePath(String(path))
  })

  // revealPath is synchronous (shell.showItemInFolder); wrap its result in a
  // resolved promise so it fits the async safeHandle contract.
  safeHandle(IPC.revealPath, (path) => {
    requireAllowed(String(path))
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
    // Grant the containing dir of the just-opened file so a later re-open of any
    // sibling (or this file) passes confinement. Covers files the user picked via
    // a dialog and tree files under an opened folder.
    grantRoot(dirname(String(path)))
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
      const isMac = process.platform === 'darwin'
      win.setTitle(formatWindowTitle(state.title, state.dirty, isMac))
      if (isMac) {
        // Proxy icon (Cmd-click -> folder breadcrumb; drag to move) + the native
        // edited dot on the close button. setRepresentedFilename('') clears the
        // proxy icon for an unsaved (path-less) document.
        win.setRepresentedFilename(state.path ?? '')
        win.setDocumentEdited(state.dirty)
      }
      // Update THIS window's close-guard dirty flag (per-window state machine).
      registry.get(win)?.setDirty(state.dirty)
    },
  )
}
