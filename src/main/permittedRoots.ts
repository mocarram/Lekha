/**
 * permittedRoots.ts - Main-process filesystem path allowlist.
 *
 * Every path-taking IPC handler (read/write/stat/readdir/create/rename/move/
 * delete/search) passes a renderer-supplied string straight to `fs`. A
 * compromised or buggy renderer could therefore read or destroy ANY file the
 * Lekha process can touch. This module is the trust boundary: a path is only
 * honoured if it was previously GRANTED - either because the user explicitly
 * chose it (a dialog result, an opened folder, a recent file) or because it
 * lives under a directory the user opened.
 *
 * The allowlist is a simple in-memory Set of normalized (path.resolve'd) roots.
 * A root may be a single file (only that exact file is allowed) or a directory
 * (the directory itself and anything contained within it are allowed). The
 * containment check uses `resolved === root || resolved.startsWith(root + sep)`
 * so a sibling directory sharing a name prefix (e.g. `/foo-bar` vs `/foo`) is
 * NOT mistakenly treated as contained.
 *
 * Grant points are wired across startup (settings restore), the dialog handlers
 * (open/save results), and addRecentFile - see those call sites. The goal is
 * zero false rejections for normal use while still rejecting arbitrary paths.
 */
import { resolve, sep } from 'node:path'

/** Normalized set of granted roots (files or directories). */
const grantedRoots = new Set<string>()

/**
 * Grant a single permitted root. The path is normalized via path.resolve so
 * grants and checks compare canonical absolute forms. Blank/whitespace-only
 * inputs are ignored (resolving '' yields the cwd, which we must never grant).
 */
export function grantRoot(p: string): void {
  if (typeof p !== 'string' || p.trim() === '') return
  grantedRoots.add(resolve(p))
}

/** Grant many roots at once. Non-string / blank entries are skipped. */
export function grantManyRoots(paths: string[]): void {
  for (const p of paths) grantRoot(p)
}

/**
 * Return true when `p` is allowed: it resolves exactly to a granted file/dir,
 * OR it is contained within a granted directory (resolved starts with
 * `root + path.sep`). Returns false for anything not covered by a grant.
 */
export function isPathAllowed(p: string): boolean {
  if (typeof p !== 'string' || p.trim() === '') return false
  const resolved = resolve(p)
  for (const root of grantedRoots) {
    if (resolved === root || resolved.startsWith(root + sep)) return true
  }
  return false
}

/**
 * Clear all granted roots. Test-only helper so each test starts from a known
 * empty allowlist (no app bootstrap runs in unit tests).
 */
export function resetPermittedRoots(): void {
  grantedRoots.clear()
}
