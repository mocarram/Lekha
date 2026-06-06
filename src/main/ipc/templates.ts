/**
 * IPC handler for template listing.
 *
 * Exposes window.lekha.listTemplates() which reads user-defined templates from
 * `userData/templates/*.md` and returns them to the renderer.
 */
import { ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC } from '@shared/ipc-channels'
import { listUserTemplates } from '@main/templates'

/**
 * Register the templates:list IPC handler.
 *
 * @param getUserDataPath - Callable that returns the current userData directory
 *   path. Passed as a thunk so tests can inject it without a live Electron app.
 */
export function registerTemplateHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(IPC.listTemplates, async () => {
    const templatesDir = join(getUserDataPath(), 'templates')
    return listUserTemplates(templatesDir)
  })
}
