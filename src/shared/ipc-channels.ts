export const IPC = {
  openFileDialog: 'dialog:openFile',
  openFolderDialog: 'dialog:openFolder',
  saveAsDialog: 'dialog:saveAs',
  /** Renderer -> main: ask the user whether to save unsaved changes.
   *  Returns 'save' | 'dontSave' | 'cancel'. */
  confirmUnsaved: 'dialog:confirmUnsaved',
  readFile: 'fs:readFile',
  writeFile: 'fs:writeFile',
  readDir: 'fs:readDir',
  getRecentFiles: 'settings:getRecentFiles',
  addRecentFile: 'settings:addRecentFile',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setDocumentState: 'window:setDocumentState',
  command: 'app:command',
  /** Main -> renderer: open a specific file path (from the Open Recent menu). */
  openPath: 'app:openPath',
} as const
