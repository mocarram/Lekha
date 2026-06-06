import type { Node } from 'prosemirror-model'
import type { DocCounts } from '@shared/types'

/**
 * Count words and characters in a ProseMirror document.
 *
 * Counting decisions:
 *
 * - Block joining: each leaf text-block's text content is collected into an
 *   array and joined with a single space (' ') before tokenising. This ensures
 *   that words at block boundaries (e.g. "end\n\nstart") are never merged into
 *   a single token ("endstart"), while the joining character itself does not
 *   add phantom words.
 *
 * - Code blocks: included (matches WYSIWYG's behaviour - the user can see and
 *   edit that text, so it contributes to the document length).
 *
 * - `chars`: the sum of `textContent.length` for every leaf text-block, before
 *   joining. Inline marks are transparent (they don't add characters). The
 *   join space is NOT counted, so `chars` reflects only actual text characters.
 *
 * - `words`: whitespace-separated non-empty tokens in the joined string, i.e.
 *   `(joined.match(/\S+/g) ?? []).length`.
 */
function textSegments(doc: Node): string[] {
  const segments: string[] = []

  doc.descendants((node) => {
    // Collect text from every leaf block (paragraphs, headings, code blocks,
    // list items, table cells, blockquotes - anything that isBlock and isLeaf
    // in the ProseMirror sense, i.e. has no block children but does have text).
    // `node.isTextblock` already covers code_block nodes (they are textblocks
    // per the schema: content 'text*', code: true). No separate branch needed.
    if (node.isTextblock) {
      const text = node.textContent
      if (text.length > 0) {
        segments.push(text)
      }
    }
  })

  return segments
}

export function countWords(doc: Node): DocCounts {
  const segments = textSegments(doc)

  // chars: total raw character count across all text blocks (no join spaces).
  const chars = segments.reduce((sum, s) => sum + s.length, 0)

  // words: join with a space so block-boundary words stay separate, then count
  // non-whitespace tokens.
  const joined = segments.join(' ')
  const words = (joined.match(/\S+/g) ?? []).length

  return { words, chars }
}

/**
 * Count words and characters in a plain selection string.
 *
 * Used for the status-bar selection counter. ProseMirror's
 * `doc.textBetween(from, to, '\n')` yields the selected text with block breaks
 * as newlines; we count:
 *   - `chars`: the raw length of the selected string (newlines included, which
 *     matches what the user perceives as "selected characters").
 *   - `words`: non-whitespace tokens (`/\S+/g`), so block boundaries split words
 *     just like countWords.
 *
 * An empty / whitespace-only selection yields `{ words: 0, chars: <len> }`.
 */
export function countSelection(text: string): DocCounts {
  const words = (text.match(/\S+/g) ?? []).length
  return { words, chars: text.length }
}

/** Average adult reading speed (words per minute) used for reading-time. */
const WORDS_PER_MINUTE = 200

/** Detailed statistics for the document-stats panel. */
export interface DocumentStats {
  words: number
  characters: number
  charactersNoSpaces: number
  lines: number
  paragraphs: number
  /** Estimated reading time, ceil(words / 200). 0 when there are no words. */
  readingTimeMinutes: number
}

/**
 * Compute detailed statistics from a plain-text/markdown string.
 *
 * Pure helper (no ProseMirror dependency) so it can run anywhere - the panel
 * passes the editor's current markdown via getMarkdown(). Counting rules:
 *
 *   - words:              non-whitespace tokens (`/\S+/g`).
 *   - characters:         the raw string length (whitespace included).
 *   - charactersNoSpaces: length after removing every whitespace character.
 *   - lines:              number of `\n`-separated lines (an empty string is 0).
 *   - paragraphs:         non-empty blocks separated by one or more blank lines.
 *   - readingTimeMinutes: ceil(words / 200); 0 when there are no words.
 */
export function documentStats(text: string): DocumentStats {
  const words = (text.match(/\S+/g) ?? []).length
  const characters = text.length
  const charactersNoSpaces = text.replace(/\s+/g, '').length
  const lines = characters === 0 ? 0 : text.split('\n').length
  const paragraphs = text
    .split(/\n\s*\n/)
    .filter((block) => block.trim().length > 0).length
  const readingTimeMinutes = Math.ceil(words / WORDS_PER_MINUTE)

  return { words, characters, charactersNoSpaces, lines, paragraphs, readingTimeMinutes }
}
