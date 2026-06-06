import type { FileNode, Settings, DocumentState } from '@shared/types'
import type { AppCommand } from '@shared/commands'

/** All methods exposed on window.lekha from the preload bridge. */
export interface LekhaAPI {
  // --- Dialogs ---
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>
  /** Show the native "unsaved changes" dialog. Returns the user's choice. */
  confirmUnsaved(): Promise<'save' | 'dontSave' | 'cancel'>

  // --- Filesystem ---
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  readDir(dir: string): Promise<FileNode[]>

  // --- Settings ---
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  getRecentFiles(): Promise<string[]>
  addRecentFile(path: string): Promise<void>

  // --- Window state ---
  setDocumentState(state: DocumentState): void

  /** Open a new, independent editor window (fresh single-document instance). */
  newWindow(): void

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
   * Subscribe to set-theme messages from the main process (Theme menu).
   * The callback receives the chosen theme id string.
   * Returns an unsubscribe function that removes the listener.
   */
  onSetTheme(cb: (id: string) => void): () => void

  // --- Export ---
  /** Save an HTML string to a .html file chosen by a save dialog. */
  exportHtml(args: { html: string; suggestedName: string }): Promise<void>
  /** Render HTML to PDF via Electron printToPDF and save to a .pdf file. */
  exportPdf(args: { html: string; suggestedName: string }): Promise<void>
  /** Export markdown to .docx via pandoc. Rejects if pandoc is not installed. */
  exportDocx(args: { markdown: string; suggestedName: string }): Promise<void>
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
}

declare global {
  interface Window {
    lekha: LekhaAPI
  }
}
