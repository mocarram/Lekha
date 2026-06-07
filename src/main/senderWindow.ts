import { BrowserWindow } from 'electron'

/**
 * Resolve the BrowserWindow that sent an IPC request so dialogs and other
 * window-scoped responses attach (modally, as sheets on macOS) to the calling
 * window rather than a single shared "main" window. Multi-window safe: each
 * request targets exactly the window that initiated it.
 *
 * Returns undefined when the sender has no owning window (e.g. it was already
 * closed); call sites decide how to handle that.
 */
export function senderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | undefined {
  return BrowserWindow.fromWebContents(event.sender) ?? undefined
}
