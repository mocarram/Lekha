import type { FileNode } from '@shared/types'

/** The directory containing `path` (its parent). Absolute POSIX paths. */
export function parentDir(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? path : path.slice(0, i)
}

/**
 * Merge a freshly-listed directory level (`next`) with that directory's
 * previous children (`prev`), carrying over any sub-directory whose children
 * were already LOADED so re-reading a directory does not collapse expanded
 * descendants. New/removed/renamed entries at this level are reflected;
 * previously-unloaded sub-directories stay unloaded.
 */
export function mergePreserveLoaded(
  prev: FileNode[] | undefined,
  next: FileNode[],
): FileNode[] {
  if (!prev) return next
  const prevByPath = new Map(prev.map((n) => [n.path, n]))
  return next.map((node) => {
    if (!node.isDirectory) return node
    const old = prevByPath.get(node.path)
    if (old && old.isDirectory && old.children !== undefined) {
      return { ...node, children: old.children }
    }
    return node
  })
}

/**
 * Returns a new tree with the directory node at `targetPath` having its
 * children set to `newChildren` (merged via mergePreserveLoaded to keep loaded
 * descendants). Only the nodes on the path from a root entry down to the target
 * are re-created; untouched branches keep their identity. Returns the SAME tree
 * reference when no node matches `targetPath`.
 */
export function setNodeChildren(
  tree: FileNode[],
  targetPath: string,
  newChildren: FileNode[],
): FileNode[] {
  const walk = (nodes: FileNode[]): FileNode[] => {
    let mutated = false
    const mapped = nodes.map((node) => {
      if (node.path === targetPath && node.isDirectory) {
        mutated = true
        return { ...node, children: mergePreserveLoaded(node.children, newChildren) }
      }
      if (node.isDirectory && node.children && node.children.length > 0) {
        const nextChildren = walk(node.children)
        if (nextChildren !== node.children) {
          mutated = true
          return { ...node, children: nextChildren }
        }
      }
      return node
    })
    return mutated ? mapped : nodes
  }
  return walk(tree)
}

/** Collects the paths of all currently-loaded directory nodes, parents first. */
export function loadedDirPaths(tree: FileNode[]): string[] {
  const out: string[] = []
  const walk = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (node.isDirectory && node.children !== undefined) {
        out.push(node.path)
        walk(node.children)
      }
    }
  }
  walk(tree)
  return out
}
