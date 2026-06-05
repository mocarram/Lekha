import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'

/** Registers IPC handlers for all native file/folder dialog operations. */
export function registerDialogHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.openFileDialog, async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.openFolderDialog, async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory'],
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })

  ipcMain.handle(IPC.saveAsDialog, async (_event, suggestedName?: string) => {
    const win = getWindow()
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      ...(suggestedName !== undefined ? { defaultPath: suggestedName } : {}),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    return result.canceled || !result.filePath ? null : result.filePath
  })
}
