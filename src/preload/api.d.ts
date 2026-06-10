import type {
  FileNode,
  FileStat,
  OpenFileStatus,
  ArticleEntry,
  Settings,
  DocumentState,
  FolderSearchResult,
  PandocFormat,
  Template,
  UserTheme,
  BackupRecord,
} from '@shared/types'
import type { AppCommand } from '@shared/commands'

/** All methods exposed on window.lekha from the preload bridge. */
export interface LekhaAPI {
  // --- Dialogs ---
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>
  /** Show the native "unsaved changes" dialog. Returns the user's choice. */
  confirmUnsaved(): Promise<'save' | 'dontSave' | 'cancel'>
  /** Show the native destructive folder-wide replace confirmation. Returns true to proceed. */
  confirmReplace(detail: string): Promise<boolean>

  // --- Filesystem ---
  readFile(path: string): Promise<string>
  /** Stat a file: size + created/modified timestamps + inode (for Get Info). */
  statFile(path: string): Promise<FileStat>
  /**
   * Resolve the absolute filesystem path of a dropped/selected File object
   * (via Electron's webUtils.getPathForFile). Used by sidebar drag-and-drop.
   */
  getPathForFile(file: File): string
  /**
   * Verify an open document is still at its path, recovering a same-folder
   * rename by inode. Returns present / renamed (with newPath) / missing.
   */
  verifyOpenFile(args: { path: string; inode: number }): Promise<OpenFileStatus>
  writeFile(path: string, content: string): Promise<void>
  readDir(dir: string): Promise<FileNode[]>
  /** List all markdown files under `root` (recursive), most-recent first. */
  listArticles(root: string): Promise<ArticleEntry[]>

  // --- File-tree entry operations ---
  /**
   * Create an empty file `name` in `dir`. A missing extension defaults to
   * ".md". Rejects if the entry already exists or the name is invalid.
   * Returns the new absolute path.
   */
  createFile(dir: string, name: string): Promise<string>
  /**
   * Create a folder `name` in `dir`. Rejects if it already exists or the name
   * is invalid. Returns the new absolute path.
   */
  createFolder(dir: string, name: string): Promise<string>
  /**
   * Rename `oldPath` to `newName` within the same parent directory. Rejects if
   * the target exists or the name is invalid. Returns the new absolute path.
   */
  renamePath(oldPath: string, newName: string): Promise<string>
  /** Duplicate the file at `path` in place ("name copy.md"); returns new path. */
  duplicatePath(path: string): Promise<string>
  /** Move the file at `srcPath` into `destDir` (keeps its name); returns new path. */
  movePath(srcPath: string, destDir: string): Promise<string>
  /**
   * Move `path` to the OS trash (RECOVERABLE - uses shell.trashItem, never a
   * permanent delete).
   */
  deletePath(path: string): Promise<void>
  /** Reveal `path` in the OS file manager (Finder / Explorer). */
  revealPath(path: string): Promise<void>

  // --- Settings ---
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getRecentFiles(): Promise<string[]>
  addRecentFile(path: string): Promise<void>

  // --- Window state ---
  setDocumentState(state: DocumentState): void

  /**
   * Report window-level dirtiness (true when ANY open tab is dirty). Drives the
   * main-process close guard and the macOS edited dot, separate from
   * setDocumentState's active-doc title indicator.
   */
  setWindowDirty(anyDirty: boolean): void

  /** Open a new, independent editor window (fresh single-document instance). */
  newWindow(): void

  /** Open the OS print dialog for this window. */
  print(): void

  /** Open the macOS share sheet for `path` (no-op on other platforms). */
  share(path: string): void

  /** Toggle this window's always-on-top (floating) state. */
  setAlwaysOnTop(value: boolean): void

  // --- Commands from main ---
  /**
   * Subscribe to app commands broadcast from the main process (menu items, etc.).
   * Returns an unsubscribe function that removes the listener.
   */
  onCommand(cb: (cmd: AppCommand) => void): () => void

  /**
   * Subscribe to open-path messages from the main process (Open Recent menu).
   * The callback receives the full file path to open.
   * Returns an unsubscribe function that removes the listener.
   */
  onOpenPath(cb: (path: string) => void): () => void

  /**
   * Drain the queue of files the OS asked Lekha to open at launch, before any
   * renderer existed to receive them (macOS "Open With"/double-click, or a
   * command-line argument on Windows/Linux). Resolves with the queued absolute
   * paths and clears the queue, so a second window won't re-open the same files.
   */
  takePendingOpen(): Promise<string[]>

  /**
   * True exactly once per app run: the FIRST window to ask owns the session
   * restore (previous tabs + crash recovery). Later windows (File > New
   * Window) receive false and start blank instead of replaying the session.
   */
  shouldRestoreSession(): Promise<boolean>

  /**
   * Subscribe to set-theme messages from the main process (Theme menu).
   * The callback receives the chosen theme id string.
   * Returns an unsubscribe function that removes the listener.
   */
  onSetTheme(cb: (id: string) => void): () => void

  /**
   * Subscribe to set-auto-save messages from the main process (File ▸ Auto Save
   * menu item). The callback receives the new boolean value.
   * Returns an unsubscribe function that removes the listener.
   */
  onSetAutoSave(cb: (value: boolean) => void): () => void

  // --- Crash-recovery backups ---
  /**
   * Write a crash-recovery backup of an unsaved buffer to app data (never the
   * user's real file). The main process stamps `savedAt` at write time.
   */
  writeBackup(record: BackupRecord): Promise<void>
  /** Delete a crash-recovery backup by its backupId (no-op if already gone). */
  deleteBackup(backupId: string): Promise<void>
  /** List all crash-recovery backup records found in app data (best-effort). */
  listBackups(): Promise<BackupRecord[]>

  // --- Export ---
  /** Save an HTML string to a .html file chosen by a save dialog. */
  exportHtml(args: { html: string; suggestedName: string }): Promise<void>
  /** Render HTML to PDF via Electron printToPDF and save to a .pdf file. */
  exportPdf(args: { html: string; suggestedName: string }): Promise<void>
  /**
   * Export markdown to docx/epub/rtf/latex/opml via pandoc. Rejects if pandoc
   * is not installed. The `format` selects the pandoc writer + file extension.
   */
  exportPandoc(args: {
    markdown: string
    suggestedName: string
    format: PandocFormat
  }): Promise<void>
  /** Returns true if pandoc is available on the system PATH. */
  pandocAvailable(): Promise<boolean>

  // --- Images ---
  /**
   * Write image bytes to disk and return the path to insert into Markdown.
   * When `docPath` is set, the image is written next to the document in an
   * `assets/` subfolder and a POSIX-relative `assets/<filename>` is returned.
   * When `docPath` is null (unsaved doc), the image is written to the user-data
   * images dir and an absolute `file://` URI is returned.
   */
  saveImage(args: {
    data: ArrayBuffer
    ext: string
    docPath: string | null
  }): Promise<{ insertPath: string }>

  // --- Shell ---
  /**
   * Open a URL in the system browser. The main process validates the scheme
   * (http/https/mailto only) before opening; unsafe URLs are ignored.
   */
  openExternal(url: string): Promise<void>

  // --- Clipboard ---
  /**
   * Write to the system clipboard via the main process. When `html` is given,
   * the clipboard receives rich HTML (with `text` as a plain-text fallback) so
   * pasting into rich-text editors preserves formatting. Text-only writes set
   * just the plain-text clipboard.
   */
  writeClipboard(args: { text?: string; html?: string }): Promise<void>
  /** Read plain text from the system clipboard (for Paste as Plain Text). */
  readClipboardText(): Promise<string>

  // --- Folder search ---
  /**
   * Search all Markdown files under `root` for lines containing `query`.
   * Returns one FolderSearchResult per file that has at least one match.
   * Empty query (<1 char) resolves to [].
   */
  searchFolder(args: {
    root: string
    query: string
    caseSensitive: boolean
    wholeWord: boolean
  }): Promise<FolderSearchResult[]>

  /**
   * Replace `query` with `replacement` across every Markdown file under `root`,
   * skipping `skipPaths` (e.g. files open with unsaved edits). Writes changed
   * files atomically and resolves with counts plus the absolute changed paths.
   */
  replaceInFolder(args: {
    root: string
    query: string
    replacement: string
    caseSensitive: boolean
    wholeWord: boolean
    skipPaths: string[]
    /** Count what would change without writing (drives the confirm dialog). */
    dryRun?: boolean
  }): Promise<{ filesChanged: number; replacements: number; changedPaths: string[] }>

  // --- Templates ---
  /**
   * List user-defined templates from the userData/templates directory.
   * Returns an empty array when the directory does not exist.
   */
  listTemplates(): Promise<Template[]>

  // --- User themes ---
  /**
   * List user-authored themes from the userData/themes directory (seeding it
   * with _template.css on first run). Returns [] when none exist.
   */
  listThemes(): Promise<UserTheme[]>
  /** Re-scan the user themes directory and return the current themes. */
  reloadThemes(): Promise<UserTheme[]>
  /** Reveal the user themes directory in the OS file manager. */
  openThemeFolder(): Promise<void>
}

declare global {
  interface Window {
    lekha: LekhaAPI
  }
}
