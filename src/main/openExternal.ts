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

/**
 * Decision for a webContents window-open request.
 *
 *   - `openExternal` is true only when the URL passed `isSafeExternalUrl`, in
 *     which case the caller should hand it to `shell.openExternal`.
 *   - The window action is ALWAYS 'deny': Lekha never opens a child Electron
 *     window (which would run with the app's privileges). Unsafe URLs are
 *     simply dropped (denied with no external open).
 *
 * Pure (no Electron / shell side effects) so the policy is unit-testable. The
 * thin handler in window.ts performs the actual `shell.openExternal` call when
 * `openExternal` is true.
 */
export interface WindowOpenDecision {
  /** Whether the caller should forward the URL to shell.openExternal. */
  openExternal: boolean
  /** Action returned to Electron's setWindowOpenHandler. Always 'deny'. */
  action: 'deny'
}

/** Decide what to do with a window-open request for `url`. */
export function decideWindowOpen(url: string): WindowOpenDecision {
  return { openExternal: isSafeExternalUrl(url), action: 'deny' }
}
