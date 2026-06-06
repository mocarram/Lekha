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
export function countWords(doc: Node): DocCounts {
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
