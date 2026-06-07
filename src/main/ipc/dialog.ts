import { ipcMain, dialog } from 'electron'
import { dirname } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { senderWindow } from '@main/senderWindow'
import { grantRoot } from '@main/permittedRoots'

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

  ipcMain.handle(IPC.openFileDialog, async (event) => {
    const win = senderWindow(event)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]!
    // The user explicitly chose this file: grant it (and its dir) so the
    // subsequent readFile/statFile passes confinement.
    grantRoot(picked)
    grantRoot(dirname(picked))
    return picked
  })

  ipcMain.handle(IPC.openFolderDialog, async (event) => {
    const win = senderWindow(event)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]!
    // Grant the opened folder so readDir / listArticles / searchFolder and every
    // file beneath it are permitted.
    grantRoot(picked)
    return picked
  })

  ipcMain.handle(IPC.saveAsDialog, async (event, suggestedName?: string) => {
    const win = senderWindow(event)
    const result = await dialog.showSaveDialog(win!, {
      ...(suggestedName !== undefined ? { defaultPath: suggestedName } : {}),
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    })
    if (result.canceled || !result.filePath) return null
    // The user chose a save destination: grant the target file and its dir so the
    // following writeFile (and any sibling save) passes confinement.
    grantRoot(result.filePath)
    grantRoot(dirname(result.filePath))
    return result.filePath
  })
}
