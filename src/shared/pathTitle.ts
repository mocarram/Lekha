/**
 * pathTitle.ts - tiny pure helpers for deriving a display title from a file
 * path. Shared by editorStore and documentsStore so both derive titles the
 * same way (DRY).
 */

/** Extract the filename from a path that uses `/` or `\` separators. */
export function basename(p: string): string {
  return p.replace(/[/\\]+$/, '').split(/[/\\]/).at(-1) ?? p
}

/** Display title for a path: the basename, or 'Untitled' when path is null. */
export function deriveTitle(path: string | null): string {
  return path !== null ? basename(path) : 'Untitled'
}
