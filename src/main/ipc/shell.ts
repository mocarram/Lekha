/**
 * shell.ts - IPC handler for opening external URLs in the system browser.
 *
 * The scheme allowlist lives in main/openExternal.ts (pure, unit-tested). This
 * thin wrapper wires it to ipcMain + shell.openExternal.
 */
import { ipcMain, shell } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { isSafeExternalUrl } from '@main/openExternal'

/** Register the openExternal IPC handler. */
export function registerShellHandlers(): void {
  ipcMain.handle(IPC.openExternal, async (_event, url: string): Promise<void> => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
      await shell.openExternal(url)
    }
  })
}
