export const IPC = {
  openFileDialog: 'dialog:openFile',
  openFolderDialog: 'dialog:openFolder',
  saveAsDialog: 'dialog:saveAs',
  /** Renderer -> main: ask the user whether to save unsaved changes.
   *  Returns 'save' | 'dontSave' | 'cancel'. */
  confirmUnsaved: 'dialog:confirmUnsaved',
  /** Renderer -> main: confirm a destructive folder-wide replace. Returns boolean. */
  confirmReplace: 'dialog:confirmReplace',
  readFile: 'fs:readFile',
  /** Renderer -> main: stat a file (size + created/modified) for Get Info. */
  statFile: 'fs:statFile',
  /**
   * Renderer -> main: verify an open document is still at its path, recovering a
   * same-folder rename by inode. Returns an OpenFileStatus.
   */
  verifyOpenFile: 'fs:verifyOpenFile',
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
  /**
   * PRELOAD -> main (send, not exposed on the lekha API): register an
   * OS-dropped path with the path policy. Sent only from getPathForFile after
   * webUtils resolved a real OS-backed File, which a renderer cannot forge.
   */
  permitDroppedPath: 'fs:permitDroppedPath',
  /**
   * Renderer -> main: ask whether THIS window owns the session restore.
   * Answers true exactly once per app run (the first window); later windows
   * (File > New Window) start blank instead of replaying the session.
   */
  shouldRestoreSession: 'session:shouldRestore',
  getRecentFiles: 'settings:getRecentFiles',
  addRecentFile: 'settings:addRecentFile',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  setDocumentState: 'window:setDocumentState',
  /**
   * Renderer -> main: window-level dirtiness (ANY open tab dirty). Drives the
   * close guard + the macOS edited dot, separate from setDocumentState's
   * active-doc title indicator.
   */
  setWindowDirty: 'window:setDirty',
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
   * Renderer -> main (invoke): drain the queue of file paths the app was asked
   * to open at launch (via macOS "Open With"/double-click `open-file`, or a
   * command-line argument on Windows/Linux) before any renderer existed to
   * receive them. The renderer pulls these once on mount; the queue is cleared
   * by the read so a second window does not re-open the same files.
   */
  takePendingOpen: 'app:takePendingOpen',
  /**
   * Main -> renderer: the user picked a theme from the native Themes menu.
   * Value-carrying (like openPath): the IPC message carries the theme id string.
   * The renderer applies + persists the theme and replies so main can rebuild
   * the menu with the updated radio check.
   */
  setTheme: 'app:setTheme',
  /**
   * Main -> renderer: the user toggled Auto Save from the native File menu.
   * Value-carrying (like setTheme): the IPC message carries the new boolean.
   * The renderer applies + persists the setting and the menu rebuilds with the
   * updated check mark.
   */
  setAutoSave: 'app:setAutoSave',
  /** Renderer -> main: write a crash-recovery backup record to app data. */
  backupWrite: 'backup:write',
  /** Renderer -> main: delete a crash-recovery backup by its backupId. */
  backupDelete: 'backup:delete',
  /** Renderer -> main: list all crash-recovery backup records from app data. */
  backupList: 'backup:list',
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
  /** Renderer -> main: replace `query` with `replacement` across the folder. */
  replaceInFolder: 'fs:replaceInFolder',
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
