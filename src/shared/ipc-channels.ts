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
  /** Renderer -> main: open a new, independent editor window. */
  newWindow: 'window:new',
  command: 'app:command',
  /** Main -> renderer: open a specific file path (from the Open Recent menu). */
  openPath: 'app:openPath',
  /**
   * Main -> renderer: the user picked a theme from the native Themes menu.
   * Value-carrying (like openPath): the IPC message carries the theme id string.
   * The renderer applies + persists the theme and replies so main can rebuild
   * the menu with the updated radio check.
   */
  setTheme: 'app:setTheme',
  // Export channels
  exportHtml: 'export:html',
  exportPdf: 'export:pdf',
  exportDocx: 'export:docx',
  pandocAvailable: 'export:pandocAvailable',
  // Image channels
  saveImage: 'fs:saveImage',
  /** Renderer -> main: open a URL in the system browser (scheme-validated). */
  openExternal: 'shell:openExternal',
  /**
   * Renderer -> main: write to the system clipboard. Accepts an optional html
   * payload (for rich paste) and/or a plain-text fallback. Using the main
   * process clipboard.write enables rich HTML clipboard content, which
   * navigator.clipboard.writeText cannot provide.
   */
  writeClipboard: 'clipboard:write',
  /**
   * Renderer -> main: search all Markdown files under `root` for `query`.
   * Returns FolderSearchResult[] - one entry per file with at least one match.
   */
  searchFolder: 'fs:searchFolder',
} as const
