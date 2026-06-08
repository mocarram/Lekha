import { type Schema, type MarkType } from 'prosemirror-model'
import {
  inputRules,
  InputRule,
  wrappingInputRule,
  textblockTypeInputRule,
  smartQuotes,
  ellipsis,
  emDash,
} from 'prosemirror-inputrules'
import { type Plugin, TextSelection, NodeSelection } from 'prosemirror-state'
import emojiDefs from 'markdown-it-emoji/lib/data/full.mjs'

// ---------------------------------------------------------------------------
// Shared inline-mark helper (DRY - used 4x below)
// ---------------------------------------------------------------------------

/**
 * Create an InputRule that wraps a matched span of inline text in `markType`.
 *
 * KNOWN FIX: The strong and em regexes use 2-group alternation so that both
 * the asterisk variant (group 1) and the underscore variant (group 2) are
 * captured. We read `match[1] ?? match[2]` rather than only `match[1]` to
 * handle the underscore branch. Reading only `match[1]` made `__bold__` and
 * `_italic_` silently fail because their text landed in `match[2]`.
 */
function markInputRule(regex: RegExp, markType: MarkType): InputRule {
  return new InputRule(regex, (state, match: RegExpMatchArray, start, end) => {
    // KNOWN FIX: read group 1 (asterisk/backtick/tilde) or group 2 (underscore)
    const inner = match[1] ?? match[2]
    if (!inner) return null

    const mark = markType.create()
    const tr = state.tr
      .replaceWith(start, end, state.schema.text(inner, [mark]))
      .removeStoredMark(markType)
    return tr
  })
}

// ---------------------------------------------------------------------------
// Math inline input rule helper
// ---------------------------------------------------------------------------

/**
 * Create an InputRule that converts $...$  (typed inline) to a math_inline
 * node. Fires when the closing $ is typed.
 *
 * Regex: /\$([^$\n]+)\$$/ - matches a $ immediately followed by non-dollar,
 * non-newline content, followed by a closing $. Group 1 is the LaTeX content.
 *
 * We exclude $$ (double dollar) by requiring the inner content is non-empty
 * and doesn't start with $, ensuring $$ doesn't accidentally trigger this.
 */
function mathInlineInputRule(schema: Schema): InputRule {
  const mathInlineType = schema.nodes['math_inline']
  if (!mathInlineType) return new InputRule(/(?!)/, () => null) // no-op if missing

  return new InputRule(
    /\$([^$\n]+)\$$/,
    (state, match: RegExpMatchArray, start, end) => {
      const latex = match[1]
      if (!latex) return null
      const node = mathInlineType.create({ latex: latex.trim() })
      return state.tr.replaceWith(start, end, node)
    },
  )
}

// ---------------------------------------------------------------------------
// Horizontal rule helper
// ---------------------------------------------------------------------------

/**
 * Create an InputRule that replaces a `---`/`***`/`___` sequence (at the
 * start of a paragraph) with a `horizontal_rule` node.
 *
 * IMPORTANT: The emDash input rule (also included in the plugin) fires when
 * `--` is typed, converting it to an em dash character (`—`). This means
 * when a user types `---`, the first two dashes become `—` and the third
 * dash leaves `—-` in the block. We therefore match BOTH the raw `---`
 * form (for editors without emDash, or when HR rule fires first) AND `—-`
 * (which is what actually ends up in the buffer after emDash fires).
 */
function hrInputRule(schema: Schema): InputRule {
  // — is the em dash produced by the emDash rule after typing `--`
  return new InputRule(
    /^(---|___|\*\*\*|—-)$/,
    (state, _match, _start, end) => {
      const hr = schema.nodes['horizontal_rule']
      if (!hr) return null
      const $pos = state.doc.resolve(end)
      const from = $pos.before($pos.depth)
      const to = $pos.after($pos.depth)
      return state.tr.replaceWith(from, to, hr.create())
    },
  )
}

// ---------------------------------------------------------------------------
// Emoji input rule
// ---------------------------------------------------------------------------

/**
 * Create an InputRule that replaces a `:shortcode:` with its unicode emoji
 * character when the closing `:` is typed. Unknown shortcodes are left as-is
 * (the rule returns null).
 *
 * The name->char map is markdown-it-emoji's `full` data set, the SAME source
 * the parser uses, so typed and pasted emoji resolve identically.
 */
function emojiInputRule(): InputRule {
  return new InputRule(
    /:([a-zA-Z0-9_+-]+):$/,
    (state, match: RegExpMatchArray, start, end) => {
      const name = match[1]
      if (!name) return null
      const char = emojiDefs[name]
      if (!char) return null
      return state.tr.insertText(char, start, end)
    },
  )
}

// ---------------------------------------------------------------------------
// Task-list input rule
// ---------------------------------------------------------------------------

/**
 * Convert a plain paragraph into a checkbox task item when the user types
 * `[ ] `, `[] `, or `[x] ` (case-insensitive) at its start - a familiar
 * gesture. The `- ` bullet rule fires before `- [ ] ` can ever complete, so
 * this rule deliberately keys off the bracket marker alone.
 *
 * Scope: only fires on a paragraph that lives directly in the document (or a
 * blockquote), never one already inside a list_item / task_item, where wrapping
 * it in a fresh task_list would nest awkwardly. Inside a list, /task and the
 * Format menu remain the path.
 */
function taskListInputRule(schema: Schema): InputRule {
  const taskListType = schema.nodes['task_list']
  const taskItemType = schema.nodes['task_item']
  const paragraphType = schema.nodes['paragraph']

  return new InputRule(/^\s*\[([ xX]?)\]\s$/, (state, match, start, end) => {
    if (!taskListType || !taskItemType || !paragraphType) return null

    const $start = state.doc.resolve(start)
    if ($start.parent.type !== paragraphType) return null

    const grandparent = $start.node($start.depth - 1)
    if (
      grandparent.type.name === 'list_item' ||
      grandparent.type.name === 'task_item'
    ) {
      return null
    }

    const checked = (match[1] ?? '').toLowerCase() === 'x'
    // Preserve any text already typed after the marker.
    const remaining = $start.parent.content.cut(end - start)
    const paragraph = paragraphType.create(null, remaining)
    const item = taskItemType.create({ checked }, paragraph)
    const list = taskListType.create(null, item)

    const from = $start.before()
    const to = $start.after()
    const tr = state.tr.replaceWith(from, to, list)
    // Place the cursor at the start of the new task item's text content
    // (open tokens: task_list + task_item + paragraph = 3 positions).
    return tr.setSelection(TextSelection.create(tr.doc, from + 3))
  })
}

// ---------------------------------------------------------------------------
// Block-equation input rule
// ---------------------------------------------------------------------------

/**
 * Typing `$$` at the start of an empty paragraph inserts a block equation
 * (a familiar gesture). Replaces the paragraph with an empty math_block and
 * selects it so the math NodeView is ready to edit.
 */
function mathBlockInputRule(schema: Schema): InputRule {
  const mathBlockType = schema.nodes['math_block']
  const paragraphType = schema.nodes['paragraph']

  // The `^\$\$$` anchors guarantee the whole line is exactly `$$`, so the rule
  // only fires on an otherwise-empty paragraph. Skip list/task items where a
  // nested block equation would be awkward.
  return new InputRule(/^\$\$$/, (state, _match, start) => {
    if (!mathBlockType || !paragraphType) return null
    const $start = state.doc.resolve(start)
    if ($start.parent.type !== paragraphType) return null
    const grandparent = $start.node($start.depth - 1)
    if (
      grandparent &&
      (grandparent.type.name === 'list_item' ||
        grandparent.type.name === 'task_item')
    ) {
      return null
    }

    const from = $start.before()
    const to = $start.after()
    const tr = state.tr.replaceWith(from, to, mathBlockType.create({ latex: '' }))
    return tr.setSelection(NodeSelection.create(tr.doc, from)).scrollIntoView()
  })
}

// ---------------------------------------------------------------------------
// buildInputRules
// ---------------------------------------------------------------------------

/** Options for {@link buildInputRules}. */
export interface InputRulesOptions {
  /**
   * Include the smart-typography rules (smart quotes, ellipsis, em dash).
   * Default true; set false to disable smart punctuation (straight quotes,
   * literal `...` and `--`).
   */
  smartPunctuation?: boolean
}

/** Assemble all input rules for the Lekha editor. */
export function buildInputRules(
  schema: Schema,
  opts: InputRulesOptions = {},
): Plugin {
  const smartPunctuation = opts.smartPunctuation !== false

  const rules: InputRule[] = [
    // Horizontal rule FIRST - must come before emDash which fires on `--`
    // so that `---` is intercepted before two dashes get converted.
    hrInputRule(schema),

    // Smart typography (from prosemirror-inputrules) - only when enabled.
    ...(smartPunctuation ? [...smartQuotes, ellipsis, emDash] : []),

    // Headings: `# ` through `###### `
    textblockTypeInputRule(
      /^(#{1,6})\s$/,
      schema.nodes['heading']!,
      (match) => ({ level: match[1]!.length }),
    ),

    // Blockquote: `> `
    wrappingInputRule(/^\s*>\s$/, schema.nodes['blockquote']!),

    // Task list: `[ ] `, `[] `, `[x] ` (must precede the bullet rule so a bare
    // bracket marker is handled here rather than slipping through).
    taskListInputRule(schema),

    // Block equation: `$$` at the start of an empty paragraph.
    mathBlockInputRule(schema),

    // Bullet list: `- `, `* `, `+ `
    wrappingInputRule(/^\s*([-*+])\s$/, schema.nodes['bullet_list']!),

    // Ordered list: `1. ` (captures start number)
    wrappingInputRule(
      /^(\d+)\.\s$/,
      schema.nodes['ordered_list']!,
      (match) => ({ order: Number(match[1]) }),
      (match, node) =>
        node.childCount + node.attrs['order'] === Number(match[1]),
    ),

    // Code block: ` ``` ` or ` ```lang `
    textblockTypeInputRule(
      /^```([a-zA-Z0-9_-]*)\s$/,
      schema.nodes['code_block']!,
      (match) => ({ language: match[1] ?? '' }),
    ),

    // Inline marks (KNOWN FIX applied in markInputRule)
    // strong: **x** or __x__  - group 1 = asterisk, group 2 = underscore
    markInputRule(
      /\*\*([^*]+)\*\*$|__([^_]+)__$/,
      schema.marks['strong']!,
    ),
    // em: *x* or _x_  - group 1 = asterisk, group 2 = underscore
    markInputRule(
      /(?<!\*)\*([^*]+)\*(?!\*)$|(?<!_)_([^_]+)_(?!_)$/,
      schema.marks['em']!,
    ),
    // inline code: `x`
    markInputRule(/`([^`]+)`$/, schema.marks['code']!),
    // strikethrough: ~~x~~  - MUST precede the subscript rule so the `~~`
    // form is consumed first and never mis-parsed as `~x~`.
    markInputRule(/~~([^~]+)~~$/, schema.marks['strikethrough']!),

    // Extended inline marks.
    // highlight: ==x==
    markInputRule(/==([^=]+)==$/, schema.marks['highlight']!),
    // subscript: ~x~  - the negative look-behind/inner guard `[^~]` prevents
    // it from firing on `~~strike~~` (no `~` allowed inside, and a preceding
    // `~` is rejected) so strikethrough keeps its `~~` form.
    markInputRule(/(?<!~)~([^~]+)~$/, schema.marks['subscript']!),
    // superscript: ^x^
    markInputRule(/\^([^^]+)\^$/, schema.marks['superscript']!),

    // emoji: :shortcode: -> unicode char (unknown shortcodes left as-is)
    emojiInputRule(),

    // Inline math: $...$  (typing the closing $ triggers the rule)
    // The regex captures non-empty content between the two dollars.
    // Does not capture $$ (double dollar) to avoid conflicting with block math.
    mathInlineInputRule(schema),
  ]

  return inputRules({ rules })
}
