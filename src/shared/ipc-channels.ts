export const IPC = {
  openFileDialog: 'dialog:openFile',
  openFolderDialog: 'dialog:openFolder',
  saveAsDialog: 'dialog:saveAs',
  /** Renderer -> main: ask the user whether to save unsaved changes.
   *  Returns 'save' | 'dontSave' | 'cancel'. */
  confirmUnsaved: 'dialog:confirmUnsaved',
  readFile: 'fs:readFile',
  /** Renderer -> main: stat a file (size + created/modified) for Get Info. */
  statFile: 'fs:statFile',
  writeFile: 'fs:writeFile',
  readDir: 'fs:readDir',
  /** Renderer -> main: list all markdown files under root as ArticleEntry[]. */
  listArticles: 'fs:listArticles',
  /** Renderer -> main: create an empty file `name` in `dir`. Returns new path. */
  createFile: 'fs:createFile',
  /** Renderer -> main: create a folder `name` in `dir`. Returns new path. */
  createFolder: 'fs:createFolder',
  /** Renderer -> main: rename `oldPath` to `newName` (same parent). Returns new path. */
  renamePath: 'fs:renamePath',
  /** Renderer -> main: duplicate a file in place ("name copy.md"). Returns new path. */
  duplicatePath: 'fs:duplicatePath',
  /** Renderer -> main: move a file into another directory. Returns new path. */
  movePath: 'fs:movePath',
  /** Renderer -> main: move `path` to the OS trash (recoverable, not permanent rm). */
  deletePath: 'fs:deletePath',
  /** Renderer -> main: reveal `path` in the OS file manager (Finder/Explorer). */
  revealPath: 'fs:revealPath',
  getRecentFiles: 'settings:getRecentFiles',
  addRecentFile: 'settings:addRecentFile',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setDocumentState: 'window:setDocumentState',
  /** Renderer -> main: open a new, independent editor window. */
  newWindow: 'window:new',
  /** Renderer -> main: open the OS print dialog for the sender's window. */
  print: 'window:print',
  /** Renderer -> main: open the macOS share sheet for a file path. */
  share: 'window:share',
  /** Renderer -> main: toggle the sender window's always-on-top state. */
  setAlwaysOnTop: 'window:setAlwaysOnTop',
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
  /**
   * Generalized pandoc export (markdown -> docx/epub/rtf/latex/opml). The
   * payload carries the target `format`; the handler maps it to the correct
   * pandoc writer + extension. Replaces the old `export:docx` channel.
   */
  exportPandoc: 'export:pandoc',
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
  /** Renderer -> main: read plain text from the system clipboard. */
  readClipboardText: 'clipboard:readText',
  /**
   * Renderer -> main: search all Markdown files under `root` for `query`.
   * Returns FolderSearchResult[] - one entry per file with at least one match.
   */
  searchFolder: 'fs:searchFolder',
  /**
   * Renderer -> main: list user-defined templates from the userData/templates dir.
   * Returns Template[] (id, name, content). Empty array when dir is missing.
   */
  listTemplates: 'templates:list',
  /**
   * Renderer -> main: list user-authored themes from the userData/themes dir
   * (seeds the folder with _template.css on first run). Returns UserTheme[].
   */
  listThemes: 'themes:list',
  /** Renderer -> main: reveal the user themes folder in the OS file manager. */
  openThemeFolder: 'themes:openFolder',
  /** Renderer -> main: re-scan the user themes folder and return UserTheme[]. */
  reloadThemes: 'themes:reload',
} as const
