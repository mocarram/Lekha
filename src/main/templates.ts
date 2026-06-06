/**
 * templates.ts (main process)
 *
 * Reads user-defined templates from a `templates/` subdirectory under the
 * app's userData directory. Each .md file becomes a Template whose id and
 * name are derived from the filename (without extension).
 *
 * Returns an empty array when the directory does not exist or contains no
 * .md files - not an error condition.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import type { Template } from '@shared/types'

/**
 * List user templates from `dir`.
 *
 * Reads all *.md files in the directory (non-recursive). Each file produces
 * one Template:
 *   id      - filename without extension
 *   name    - filename without extension (same as id; shown in the picker)
 *   content - full file text (UTF-8)
 *
 * Returns [] when the directory is missing or unreadable.
 */
export async function listUserTemplates(dir: string): Promise<Template[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    // Directory does not exist or is not accessible.
    return []
  }

  const mdFiles = entries.filter((name) => extname(name).toLowerCase() === '.md')

  const templates: Template[] = []
  for (const fileName of mdFiles) {
    const filePath = join(dir, fileName)
    // Skip entries that are not regular files (e.g. a directory named foo.md).
    try {
      const info = await stat(filePath)
      if (!info.isFile()) continue
    } catch {
      continue
    }

    const content = await readFile(filePath, 'utf8')
    const nameWithoutExt = basename(fileName, extname(fileName))
    templates.push({ id: nameWithoutExt, name: nameWithoutExt, content })
  }

  return templates
}
