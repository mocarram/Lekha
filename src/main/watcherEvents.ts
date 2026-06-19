import { dirname } from 'node:path'

export interface WatcherEvent {
  type: 'create' | 'update' | 'delete'
  path: string
}

/** A path segment that should never produce a tree refresh. */
function isIgnoredPath(p: string): boolean {
  // Split into segments; ignore anything inside node_modules / .git, or any
  // dotfile/dotdir segment (matches the tree's own filters so we never flood).
  const segments = p.split('/')
  return segments.some(
    (seg) => seg === 'node_modules' || seg === '.git' || (seg.startsWith('.') && seg.length > 1),
  )
}

/**
 * Maps a batch of watcher events to the unique set of PARENT directories that
 * changed, dropping events under ignored paths. Pure and deterministic - the
 * renderer re-reads each returned dir if it is currently loaded.
 */
export function changedDirsFromEvents(events: WatcherEvent[]): string[] {
  const dirs = new Set<string>()
  for (const event of events) {
    if (isIgnoredPath(event.path)) continue
    dirs.add(dirname(event.path))
  }
  return [...dirs]
}

/**
 * Rewrites a changed directory from the watcher's real-path namespace back to
 * the watched root's original (possibly-symlinked) namespace. @parcel/watcher
 * (FSEvents) reports symlink-resolved paths, but the renderer's tree keys nodes
 * by the unresolved path the folder was opened with. When realRoot === watchedRoot
 * (no symlink) this is a no-op.
 */
export function remapToWatchedRoot(
  changedDir: string,
  realRoot: string,
  watchedRoot: string,
): string {
  if (realRoot === watchedRoot) return changedDir
  if (changedDir === realRoot) return watchedRoot
  if (changedDir.startsWith(realRoot + '/')) {
    return watchedRoot + changedDir.slice(realRoot.length)
  }
  return changedDir
}
