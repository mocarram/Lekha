import { ipcMain, dialog } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { senderWindow } from '@main/senderWindow'
import { allowFile, allowRoot } from '@main/pathPolicy'

/** The three choices the user can make when there are unsaved changes. */
export type UnsavedChoice = 'save' | 'dontSave' | 'cancel'

/**
 * Map a dialog button index to a UnsavedChoice.
 * Buttons array: ['Save', "Don't Save", 'Cancel'] -> indices 0, 1, 2.
 * This is a pure helper so it can be unit-tested independently.
 */
function mapUnsavedResponse(index: number): UnsavedChoice {
  if (index === 0) return 'save'
  if (index === 1) return 'dontSave'
  return 'cancel'
}

/** Registers IPC handlers for all native file/folder dialog operations. */
export function registerDialogHandlers(): void {
  // --- Unsaved-changes guard dialog ---
  // Invoked by the renderer before open() / openPath() / newFile() when dirty.
  // Modal to the calling window (event.sender), not a global main window.
  ipcMain.handle(IPC.confirmUnsaved, async (event): Promise<UnsavedChoice> => {
    const win = senderWindow(event)
    const result = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Save', "Don't Save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      message: 'Do you want to save the changes you made?',
      detail: "Your changes will be lost if you don't save them.",
    })
    return mapUnsavedResponse(result.response)
  })

  // --- Folder-replace confirmation (destructive, not undoable) ---
  ipcMain.handle(IPC.confirmReplace, async (event, detail: string): Promise<boolean> => {
    const win = senderWindow(event)
    const result = await dialog.showMessageBox(win!, {
      type: 'warning',
      buttons: ['Replace All', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Replace across files?',
      detail,
    })
    return result.response === 0
  })

  ipcMain.handle(IPC.openFileDialog, async (event) => {
    const win = senderWindow(event)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    // A dialog choice is explicit user intent: permit the path for the
    // filesystem IPC handlers (see pathPolicy.ts).
    allowFile(result.filePaths[0]!)
    return result.filePaths[0]!
  })

  ipcMain.handle(IPC.openFolderDialog, async (event) => {
    const win = senderWindow(event)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    // A chosen folder permits its whole subtree (tree, search, replace, move).
    allowRoot(result.filePaths[0]!)
    return result.filePaths[0]!
  })

  ipcMain.handle(IPC.saveAsDialog, async (event, suggestedName?: string) => {
    const win = senderWindow(event)
    const result = await dialog.showSaveDialog(win!, {
      ...(suggestedName !== undefined ? { defaultPath: suggestedName } : {}),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || !result.filePath) return null
    allowFile(result.filePath)
    return result.filePath
  })
}
