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

  // --- Export ---
  /** Save an HTML string to a .html file chosen by a save dialog. */
  exportHtml(args: { html: string; suggestedName: string }): Promise<void>
  /** Render HTML to PDF via Electron printToPDF and save to a .pdf file. */
  exportPdf(args: { html: string; suggestedName: string }): Promise<void>
  /** Export markdown to .docx via pandoc. Rejects if pandoc is not installed. */
  exportDocx(args: { markdown: string; suggestedName: string }): Promise<void>
  /** Returns true if pandoc is available on the system PATH. */
  pandocAvailable(): Promise<boolean>
}

declare global {
  interface Window {
    lekha: LekhaAPI
  }
}
