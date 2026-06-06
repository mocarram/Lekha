/**
 * Ambient type declarations for the extended-inline markdown-it plugins, which
 * ship without their own types: highlight (`==x==`), subscript (`~x~`),
 * superscript (`^x^`), and emoji (`:shortcode:`).
 *
 * Each of mark/sub/sup is a plain `(md) => void` plugin (default export). The
 * emoji package exposes named `full`/`light`/`bare` plugin factories; we use
 * `full` for the broadest shortcode coverage. Its internal data map (name ->
 * unicode char) is imported for the input rule that turns `:smile:` into 😄.
 */

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'

  const markPlugin: (md: MarkdownIt) => void
  export default markPlugin
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'

  const subPlugin: (md: MarkdownIt) => void
  export default subPlugin
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'

  const supPlugin: (md: MarkdownIt) => void
  export default supPlugin
}

declare module 'markdown-it-emoji' {
  import type MarkdownIt from 'markdown-it'

  interface EmojiOptions {
    defs?: Record<string, string>
    shortcuts?: Record<string, string | string[]>
    enabled?: string[]
  }

  export const full: (md: MarkdownIt, options?: EmojiOptions) => void
  export const light: (md: MarkdownIt, options?: EmojiOptions) => void
  export const bare: (md: MarkdownIt, options?: EmojiOptions) => void
}

declare module 'markdown-it-emoji/lib/data/full.mjs' {
  /** Shortcode name (without colons) -> unicode emoji character. */
  const defs: Record<string, string>
  export default defs
}
