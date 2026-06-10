/**
 * openable.ts - THE single definition of which file extensions Lekha opens as
 * a text/markdown document tab.
 *
 * Consumed by every feature that filters files: sidebar drag-drop, OS
 * Open With (argv), the file tree + folder search (main), and quick-open.
 * electron-builder.yml's fileAssociations mirrors this list - keep them in
 * sync when adding an extension.
 */

/** Extensions (no dot, lowercase) Lekha can open as a document tab. */
export const OPENABLE_EXTENSIONS = [
  'md',
  'markdown',
  'mdown',
  'mkd',
  'mdx',
  'txt',
  'text',
] as const

/** Case-insensitive path test for an openable extension. */
export const OPENABLE_EXT_RE = new RegExp(`\\.(${OPENABLE_EXTENSIONS.join('|')})$`, 'i')

/** Dotted lowercase set ('.md', ...) for extname()-style lookups. */
export const OPENABLE_EXT_SET: ReadonlySet<string> = new Set(
  OPENABLE_EXTENSIONS.map((ext) => `.${ext}`),
)

/** Returns true when `path` has an extension Lekha can open as a tab. */
export function isOpenablePath(path: string): boolean {
  return OPENABLE_EXT_RE.test(path)
}
