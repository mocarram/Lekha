/**
 * pandocFormats.ts - Single source of truth for the pandoc format -> output
 * file extension mapping.
 *
 * Both the renderer (useCommands.ts, which seeds the save-dialog default name)
 * and the main process (export.ts, which derives the writer/filter metadata)
 * previously encoded this `format -> extension` table independently. They are
 * unified here so adding or changing a format is a one-line edit in one place.
 *
 * The PandocFormat union itself lives in @shared/types (it is referenced across
 * the preload boundary); this module owns only the extension mapping derived
 * from it.
 */
import type { PandocFormat } from '@shared/types'

/**
 * Output file extension (no leading dot) for each pandoc format. `latex` writes
 * a `.tex` file; every other format's extension matches its name.
 */
export const PANDOC_EXTENSIONS: Record<PandocFormat, string> = {
  docx: 'docx',
  epub: 'epub',
  rtf: 'rtf',
  latex: 'tex',
  opml: 'opml',
}

/** Output file extension (no leading dot) for a pandoc format. */
export function pandocExtension(format: PandocFormat): string {
  return PANDOC_EXTENSIONS[format]
}
