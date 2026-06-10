/**
 * files.ts - flatten the workspace file tree into the flat list quick-open
 * needs. Only openable text/markdown files are kept (quick-open searches
 * notes, not assets).
 *
 * The relative directory is derived against the workspace root so the palette
 * can show "todo.md  notes/sub" without leaking the absolute path. Files at the
 * root get an empty dir.
 */
import type { FileNode } from '@shared/types'
import { isOpenablePath } from '@shared/openable'
import type { PaletteFileEntry } from '@renderer/components/CommandPalette'

/** Compute the directory of `path` relative to `root` ('' when at the root). */
function relativeDir(root: string | null, path: string): string {
  const lastSep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  const dir = lastSep === -1 ? '' : path.slice(0, lastSep)
  if (root === null) return dir
  if (dir === root) return ''
  // Strip the root prefix (and its trailing separator) when present.
  if (dir.startsWith(root)) {
    return dir.slice(root.length).replace(/^[/\\]+/, '')
  }
  return dir
}

/**
 * Depth-first flatten of `tree` into Markdown-file entries, preserving the
 * tree's order so an empty palette query lists files top-to-bottom as shown in
 * the sidebar.
 */
export function flattenFiles(
  tree: readonly FileNode[],
  root: string | null,
): PaletteFileEntry[] {
  const out: PaletteFileEntry[] = []

  const walk = (nodes: readonly FileNode[]): void => {
    for (const node of nodes) {
      if (node.isDirectory) {
        if (node.children) walk(node.children)
        continue
      }
      if (!isOpenablePath(node.name)) continue
      out.push({
        path: node.path,
        name: node.name,
        dir: relativeDir(root, node.path),
      })
    }
  }

  walk(tree)
  return out
}
