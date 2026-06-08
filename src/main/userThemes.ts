/**
 * userThemes.ts (main process)
 *
 * Loads user-authored themes from a `themes/` subdirectory under the app's
 * userData directory. Each *.css file is a token-override theme (a
 * [data-theme="<id>"] block, see styles/themes/_template.css). The file name
 * (minus .css) is the theme id; an optional header comment supplies metadata:
 *
 *     / * @name Solar Flare @type dark * /
 *
 * Security: only *.css files in the one themes folder are read (no traversal,
 * no subdirectories). The returned CSS is injected by the renderer as
 * style-only content (never executed); the renderer also strips any closing
 * </style> sequence. Themes are local-trust.
 */
import { readdir, readFile, lstat, mkdir, writeFile } from 'node:fs/promises'
import { join, basename, extname } from 'node:path'
import { THEMES, type UserTheme } from '@shared/types'

/** Lower-cased built-in theme ids - user themes may never shadow these. */
const BUILTIN_THEME_IDS = new Set(THEMES.map((t) => t.id.toLowerCase()))

/**
 * Parse the optional metadata header comment from a theme's CSS.
 * Recognizes `@name <text>` and `@type dark|light`, but ONLY inside a comment
 * at the very TOP of the file. This prevents a `@name`/`@type` that appears in
 * a comment lower down (e.g. inside a token value) from being picked up as the
 * theme's metadata. Returns nulls when a field is absent.
 */
export function parseThemeMetadata(css: string): {
  name: string | null
  type: 'dark' | 'light' | null
} {
  // Only the leading comment block (after optional whitespace) is metadata.
  const leading = /^\s*\/\*([\s\S]*?)\*\//.exec(css)
  const scope = leading ? leading[1]! : ''
  // @name runs until the next delimiter: another @tag, end of line, or end of
  // the comment scope. Lazy capture + lookahead keeps spaces inside the name.
  const nameMatch = /@name\s+(.+?)(?=\s*(?:@|\r|\n|$))/.exec(scope)
  const typeMatch = /@type\s+(dark|light)\b/i.exec(scope)
  const name = nameMatch ? nameMatch[1]!.trim() : null
  const type = typeMatch ? (typeMatch[1]!.toLowerCase() as 'dark' | 'light') : null
  return { name: name && name.length > 0 ? name : null, type }
}

/**
 * Build a UserTheme from a file name + its CSS:
 *   id    - file name without the .css extension
 *   label - @name metadata, falling back to the id
 *   type  - @type metadata, falling back to 'dark'
 */
export function deriveUserTheme(fileName: string, css: string): UserTheme {
  const id = basename(fileName, extname(fileName))
  const { name, type } = parseThemeMetadata(css)
  return {
    id,
    label: name ?? id,
    type: type ?? 'dark',
    css,
  }
}

/**
 * Whether a file name is a listable theme: a non-hidden *.css file. Files
 * beginning with `_` are treated as templates/partials (e.g. `_template.css`)
 * and are NOT listed as selectable themes.
 */
export function isThemeFile(fileName: string): boolean {
  return (
    extname(fileName).toLowerCase() === '.css' &&
    !fileName.startsWith('_') &&
    !fileName.startsWith('.')
  )
}

/**
 * List user themes from `dir`. Reads every listable *.css file (non-recursive),
 * deriving id/label/type. Returns [] when the directory is missing/unreadable.
 */
export async function listUserThemes(dir: string): Promise<UserTheme[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const themes: UserTheme[] = []
  for (const fileName of entries.filter(isThemeFile)) {
    const filePath = join(dir, fileName)
    try {
      // lstat (not stat) so symlinks are NOT followed: a symlink named *.css
      // pointing at, say, ~/.ssh/id_rsa is rejected here (isFile() is false for
      // a symlink), preventing arbitrary file reads via the themes folder.
      const info = await lstat(filePath)
      if (!info.isFile()) continue
    } catch {
      continue
    }
    const css = await readFile(filePath, 'utf8')
    themes.push(deriveUserTheme(fileName, css))
  }

  // De-duplicate + drop built-in collisions so the Theme menu never shows two
  // entries for the same id and a user theme can never shadow a built-in:
  //   - case-insensitive id dedupe (first wins): on a case-insensitive file
  //     system "night.css" and "night.CSS" would otherwise yield two id "night"
  //     /"night" themes (one survives readdir, but guard anyway).
  //   - drop any id that collides with a built-in theme (built-in wins).
  const seen = new Set<string>()
  const deduped: UserTheme[] = []
  for (const t of themes) {
    const key = t.id.toLowerCase()
    if (BUILTIN_THEME_IDS.has(key)) continue
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(t)
  }

  // Stable, predictable order (by label, case-insensitive).
  deduped.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()))
  return deduped
}

/**
 * Ensure the themes folder exists and, when it contains no *.css files yet,
 * seed it with `_template.css` so users have a starting point. Idempotent and
 * safe to call on every launch.
 */
export async function ensureUserThemesDir(dir: string, templateCss: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    entries = []
  }
  const hasCss = entries.some((n) => extname(n).toLowerCase() === '.css')
  if (!hasCss && templateCss.length > 0) {
    await writeFile(join(dir, '_template.css'), templateCss, 'utf8')
  }
}
