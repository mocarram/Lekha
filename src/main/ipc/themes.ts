/**
 * IPC handlers for user-authored themes.
 *
 * Exposes:
 *   themes:list       - ensure the themes folder exists (seed _template.css on
 *                       first run) and return the user themes.
 *   themes:reload     - re-scan the folder and return the user themes.
 *   themes:openFolder - reveal the themes folder in the OS file manager.
 *
 * The themes folder is `userData/themes`. Only *.css files there are read.
 */
import { ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { listUserThemes, ensureUserThemesDir } from '@main/userThemes'

/**
 * Register the themes IPC handlers.
 *
 * @param getUserDataPath - Thunk returning the userData directory path.
 * @param getTemplateCss  - Thunk returning the _template.css contents used to
 *   seed an empty themes folder on first run.
 */
export function registerThemeHandlers(
  getUserDataPath: () => string,
  getTemplateCss: () => string,
): void {
  const themesDir = (): string => join(getUserDataPath(), 'themes')

  const listWithSeed = async (): Promise<ReturnType<typeof listUserThemes>> => {
    const dir = themesDir()
    await ensureUserThemesDir(dir, getTemplateCss())
    return listUserThemes(dir)
  }

  ipcMain.handle(IPC.listThemes, () => listWithSeed())
  ipcMain.handle(IPC.reloadThemes, () => listWithSeed())
  ipcMain.handle(IPC.openThemeFolder, async () => {
    const dir = themesDir()
    await ensureUserThemesDir(dir, getTemplateCss())
    await shell.openPath(dir)
  })
}
