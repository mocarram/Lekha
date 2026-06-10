/**
 * shell.ts - IPC handlers for system integration: opening external URLs in the
 * system browser, and writing to the system clipboard.
 *
 * The scheme allowlist lives in main/openExternal.ts (pure, unit-tested). This
 * thin wrapper wires it to ipcMain + shell.openExternal.
 */
import { clipboard, shell } from 'electron'
import { guardedIpc } from '@main/ipcGuard'
import { IPC } from '@shared/ipc-channels'
import { isSafeExternalUrl } from '@main/openExternal'

/** Payload for the writeClipboard IPC. At least one field should be present. */
export interface ClipboardWriteArgs {
  /** Plain-text content (also used as the fallback when html is supplied). */
  text?: string
  /** Rich HTML content for pasting into rich-text editors. */
  html?: string
}

/** Register the openExternal + writeClipboard IPC handlers. */
export function registerShellHandlers(): void {
  guardedIpc.handle(IPC.openExternal, async (_event, url: string): Promise<void> => {
    if (typeof url === 'string' && isSafeExternalUrl(url)) {
      await shell.openExternal(url)
    }
  })

  // Rich clipboard write via the main process. When html is present we use
  // clipboard.write({ html, text }) so pasting into rich editors keeps the
  // formatting, with text as the plain-text fallback. Text-only writes use
  // clipboard.writeText.
  guardedIpc.handle(IPC.writeClipboard, (_event, args: ClipboardWriteArgs): void => {
    const { text, html } = args ?? {}
    if (typeof html === 'string') {
      clipboard.write({ html, ...(typeof text === 'string' ? { text } : {}) })
    } else if (typeof text === 'string') {
      clipboard.writeText(text)
    }
  })

  // Plain-text clipboard read (for "Paste as Plain Text").
  guardedIpc.handle(IPC.readClipboardText, (): string => clipboard.readText())
}
