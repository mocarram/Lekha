import { ipcMain, dialog, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'

/** The three choices the user can make when there are unsaved changes. */
export type UnsavedChoice = 'save' | 'dontSave' | 'cancel'

/**
 * Map a dialog button index to a UnsavedChoice.
 * Buttons array: ['Save', "Don't Save", 'Cancel'] -> indices 0, 1, 2.
 * This is a pure helper so it can be unit-tested independently.
 */
export function mapUnsavedResponse(index: number): UnsavedChoice {
  if (index === 0) return 'save'
  if (index === 1) return 'dontSave'
  return 'cancel'
}

/** Registers IPC handlers for all native file/folder dialog operations. */
export function registerDialogHandlers(getWindow: () => BrowserWindow | null): void {
  // --- Unsaved-changes guard dialog ---
  // Invoked by the renderer before open() / openPath() / newFile() when dirty.
  ipcMain.handle(IPC.confirmUnsaved, async (): Promise<UnsavedChoice> => {
    const win = getWindow()
    const result = await dialog.showMessageBox(win ?? undefined!, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Do you want to save the changes you made?',
      detail: "Your changes will be lost if you don't save them.",
    })
    return mapUnsavedResponse(result.response)
  })

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
