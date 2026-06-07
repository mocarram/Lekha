/** Document line-ending style. */
export type Eol = 'lf' | 'crlf'

/**
 * Normalize all line endings in `text` to the requested style. First collapses
 * any CRLF/CR to LF, then (for 'crlf') converts LF back to CRLF. Idempotent.
 */
export function normalizeLineEndings(text: string, eol: Eol): string {
  const lf = text.replace(/\r\n?/g, '\n')
  return eol === 'crlf' ? lf.replace(/\n/g, '\r\n') : lf
}

/** Detect a file's line-ending style from its content (CRLF if any \r\n present). */
export function detectEol(text: string): Eol {
  return text.includes('\r\n') ? 'crlf' : 'lf'
}
