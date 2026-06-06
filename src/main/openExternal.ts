/**
 * openExternal.ts
 *
 * Guards shell.openExternal so the renderer can only ask the main process to
 * open URLs with a safe scheme. Without this, a malicious or malformed link
 * (file:, javascript:, data:) reaching shell.openExternal could read local
 * files or execute code. The allowlist is intentionally tiny.
 *
 * This module has NO Electron imports so isSafeExternalUrl is trivially
 * unit-testable in a plain Node environment. The actual IPC handler
 * registration (which needs ipcMain/shell) lives in ipc/shell.ts.
 */

/** Schemes the app is willing to hand off to the OS. */
const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/**
 * Return true when `url` parses and uses an allowed scheme (http/https/mailto).
 * Case-insensitive about the scheme. Rejects everything else (file:, data:,
 * javascript:, and any unparseable string).
 */
export function isSafeExternalUrl(url: string): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return ALLOWED_SCHEMES.has(parsed.protocol.toLowerCase())
  } catch {
    return false
  }
}
