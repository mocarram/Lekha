/**
 * pathPolicy.ts - main-process allowlist scoping the filesystem IPC surface.
 *
 * The renderer is sandboxed and the preload exposes only typed channels, but
 * the path-taking handlers (readFile/writeFile/movePath/...) accepted ANY
 * absolute path, granting a hypothetically compromised renderer full-disk
 * authority. This module is the defense-in-depth fix: main tracks which paths
 * the user has actually put in play, and the handlers reject everything else.
 *
 * Paths become permitted ONLY via main-process-observable user intent:
 *   - native dialog results (open file / open folder / save as)
 *   - OS "Open With" deliveries (open-file event, argv, second-instance)
 *   - persisted session state main itself stored (recents, last folder, tabs)
 *   - crash-backup records (their original document paths, for restore)
 *   - OS drag-drops, registered by the PRELOAD when webUtils.getPathForFile
 *     resolves a real OS-backed File (a synthetic File yields '' and is never
 *     registered)
 *   - results of permitted operations that mint new paths (create/duplicate/
 *     rename/move)
 *
 * Folders are permitted as ROOTS (the whole subtree); files individually.
 * The registry is process-wide (all windows share it): the goal is scoping the
 * app's authority to user-chosen locations, not isolating windows from each
 * other.
 */
import { resolve, sep } from 'node:path'

/** Exact file paths the renderer may operate on. */
const allowedFiles = new Set<string>()

/** Directory roots whose entire subtree the renderer may operate on. */
const allowedRoots = new Set<string>()

/**
 * Canonical comparison form: absolute, '..' collapsed, trailing separator
 * trimmed, and case-folded on the case-insensitive platforms (macOS/Windows)
 * so 'ALLOWED/file' cannot bypass a check that allowed 'allowed/file'.
 */
function canon(p: string): string {
  let out = resolve(p)
  if (out.length > 1 && out.endsWith(sep)) out = out.slice(0, -1)
  if (process.platform === 'darwin' || process.platform === 'win32') {
    out = out.toLowerCase()
  }
  return out
}

/** Permit a single file path. No-op for empty strings. */
export function allowFile(path: string): void {
  if (!path) return
  allowedFiles.add(canon(path))
}

/** Permit a directory and everything beneath it. No-op for empty strings. */
export function allowRoot(dir: string): void {
  if (!dir) return
  allowedRoots.add(canon(dir))
}

/** True when `path` is an allowed file or sits under an allowed root. */
export function isPathAllowed(path: string): boolean {
  const p = canon(path)
  if (allowedFiles.has(p)) return true
  for (const root of allowedRoots) {
    if (p === root || p.startsWith(root + sep)) return true
  }
  return false
}

/**
 * Gate for the filesystem IPC handlers: throws a clean, renderer-presentable
 * Error when `path` was never put in play by the user.
 */
export function assertPathAllowed(path: string): void {
  if (!isPathAllowed(path)) {
    throw new Error(
      'Access to this path is not permitted. Open the file or its folder in Lekha first.',
    )
  }
}

/** Test-only: wipe the registry so unit tests stay independent. */
export function _resetPathPolicy(): void {
  allowedFiles.clear()
  allowedRoots.clear()
}
