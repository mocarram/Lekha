/**
 * windowTitle.ts (main process)
 *
 * Formats the BrowserWindow title from the document state. Pure + testable.
 *
 * Platform convention:
 *   - macOS shows unsaved state via the native "edited dot" on the close button
 *     (BrowserWindow.setDocumentEdited) and the title-bar proxy icon
 *     (setRepresentedFilename), so the title itself is just the document name -
 *     a leading "• " would be redundant and non-idiomatic.
 *   - Windows/Linux have no such affordance, so we prefix a "• " when dirty.
 */
export function formatWindowTitle(title: string, dirty: boolean, isMac: boolean): string {
  if (isMac) return title
  return dirty ? `• ${title}` : title
}
