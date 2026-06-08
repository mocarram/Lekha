import type MarkdownIt from 'markdown-it'
import type StateInline from 'markdown-it/lib/rules_inline/state_inline.mjs'

/**
 * markdown-it inline plugin for underline via raw `<u>…</u>` tags.
 *
 * Markdown has no underline syntax, so Lekha stores underline as
 * literal `<u>`/`</u>` HTML. The tokenizer runs with `html: false`, so those
 * tags would otherwise render as escaped text. This rule recognizes the bare
 * `<u>` and `</u>` tokens and emits paired `u_open`/`u_close` inline tokens,
 * which the MarkdownParser maps to the `underline` mark (token spec key `u`).
 * Only these two exact tags are handled - no general HTML is enabled.
 */
export function underlinePlugin(md: MarkdownIt): void {
  md.inline.ruler.before('emphasis', 'underline', (state: StateInline, silent): boolean => {
    const src = state.src
    const start = state.pos
    // Fast bail: must start with '<'.
    if (src.charCodeAt(start) !== 0x3c) return false

    if (src.startsWith('<u>', start)) {
      if (!silent) {
        const token = state.push('u_open', 'u', 1)
        token.markup = '<u>'
      }
      state.pos += 3
      return true
    }
    if (src.startsWith('</u>', start)) {
      if (!silent) {
        const token = state.push('u_close', 'u', -1)
        token.markup = '</u>'
      }
      state.pos += 4
      return true
    }
    return false
  })
}
