import type { FileNode, Settings, DocumentState } from '@shared/types'
import type { AppCommand } from '@shared/commands'

/** All methods exposed on window.lekha from the preload bridge. */
export interface LekhaAPI {
  // --- Dialogs ---
  openFileDialog(): Promise<string | null>
  openFolderDialog(): Promise<string | null>
  saveAsDialog(suggestedName?: string): Promise<string | null>

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
}

declare global {
  interface Window {
    lekha: LekhaAPI
  }
}
