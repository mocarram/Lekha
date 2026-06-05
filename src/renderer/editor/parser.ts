import { type Node } from 'prosemirror-model'
import { MarkdownParser, type ParseSpec } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import type { Nesting } from 'markdown-it/lib/token.mjs'
import type StateCore from 'markdown-it/lib/rules_core/state_core.mjs'
import taskLists from 'markdown-it-task-lists'
import { mathPlugin } from './math-plugin'
import { schema } from './schema'

/**
 * Markdown -> ProseMirror document parser for Lekha.
 *
 * Uses markdown-it (CommonMark + GFM strikethrough/tables/task-lists) to
 * tokenize, then a `MarkdownParser` over the shared `schema` to build the doc.
 * Two custom core rules massage markdown-it's token stream into shapes the
 * baseline parser machinery can consume:
 *   - `lekhaTaskLists`: retypes checkbox `<ul>`s to `task_list`/`task_item`.
 *   - `lekhaTables`:    wraps each table cell's inline run in a paragraph.
 */

// ---------------------------------------------------------------------------
// Custom markdown-it core rules
// ---------------------------------------------------------------------------

const TASK_LIST_CLASS = 'contains-task-list'
const TASK_ITEM_CLASS = 'task-list-item'

/** Does this token's `class` attribute include `cls`? */
function hasClass(token: Token, cls: string): boolean {
  const value = token.attrGet('class')
  return value !== null && value.split(/\s+/).includes(cls)
}

/**
 * Retype checkbox lists so the document parser can map them to `task_list`.
 *
 * markdown-it-task-lists (run before this) tags a `<ul>` with
 * `contains-task-list` and each checkbox `<li>` with `task-list-item`, then
 * injects synthetic `<label>`/`<input>` html_inline tokens (and a leading
 * space) into the item's inline content. We:
 *   - retype only UNORDERED checkbox lists (`bullet_list_*` -> `task_list_*`);
 *     ordered lists stay `ordered_list`/`list_item` (GFM task lists are
 *     unordered-only, so we accept the dropped marker there);
 *   - retype only checkbox `<li>`s to `task_item`, recording `checked`;
 *   - strip the synthetic `<label>`/`<input>` artefacts and the leading space
 *     from every `task-list-item`, regardless of list ordering.
 * Plain items inside a mixed list keep their `list_item_*` type, which is why
 * the schema's `task_list` content allows `(task_item | list_item)+`.
 */
function lekhaTaskLists(state: StateCore): boolean {
  const tokens = state.tokens
  // Promote checkbox `<ul>` open tokens (their closes are paired below, since a
  // close token carries no attrs to test).
  for (const token of tokens) {
    if (token.type === 'bullet_list_open' && hasClass(token, TASK_LIST_CLASS)) {
      token.type = 'task_list_open'
    }
  }
  retypeTaskListCloses(tokens)

  // Promote checkbox `<li>`s ONLY inside a promoted `task_list`. Ordered lists
  // with checkboxes keep `ordered_list`/`list_item` (the checkbox marker is
  // dropped — acceptable, GFM task lists are unordered-only). Tracking the
  // enclosing list type also prevents emitting `task_item`s into an
  // `ordered_list`, whose schema content (`list_item+`) would reject them.
  const listStack: ('task' | 'other')[] = []
  for (const [i, token] of tokens.entries()) {
    if (token.type === 'task_list_open') {
      listStack.push('task')
    } else if (
      token.type === 'bullet_list_open' ||
      token.type === 'ordered_list_open'
    ) {
      listStack.push('other')
    } else if (
      token.type === 'task_list_close' ||
      token.type === 'bullet_list_close' ||
      token.type === 'ordered_list_close'
    ) {
      listStack.pop()
    } else if (
      token.type === 'list_item_open' &&
      hasClass(token, TASK_ITEM_CLASS) &&
      listStack[listStack.length - 1] === 'task'
    ) {
      token.type = 'task_item_open'
      token.attrSet('data-checked', isChecked(tokens, i) ? 'true' : 'false')
      stripCheckboxArtefacts(tokens, i)
    } else if (
      token.type === 'list_item_open' &&
      hasClass(token, TASK_ITEM_CLASS)
    ) {
      // Checkbox item in a non-task (ordered) list: still strip artefacts so
      // the `<input>`/`<label>` html_inline tokens don't leak into output.
      stripCheckboxArtefacts(tokens, i)
    }
  }
  retypeTaskItemCloses(tokens)
  return true
}

/**
 * Walk the stream and retype each `bullet_list_close` whose matching
 * `bullet_list_open` we promoted to `task_list_open`. We match by a running
 * depth counter over bullet-list open/close pairs.
 */
function retypeTaskListCloses(tokens: Token[]): void {
  const openStack: boolean[] = []
  for (const token of tokens) {
    if (token.type === 'task_list_open' || token.type === 'bullet_list_open') {
      openStack.push(token.type === 'task_list_open')
    } else if (token.type === 'bullet_list_close') {
      if (openStack.pop()) token.type = 'task_list_close'
    }
  }
}

/** Mirror of {@link retypeTaskListCloses} for list-item open/close pairs. */
function retypeTaskItemCloses(tokens: Token[]): void {
  const openStack: boolean[] = []
  for (const token of tokens) {
    if (token.type === 'task_item_open' || token.type === 'list_item_open') {
      openStack.push(token.type === 'task_item_open')
    } else if (token.type === 'list_item_close') {
      if (openStack.pop()) token.type = 'task_item_close'
    }
  }
}

/**
 * Read the checkbox state for the item opened at `openIndex` by inspecting the
 * synthetic `<input>` html_inline token in the item's inline content.
 */
function isChecked(tokens: Token[], openIndex: number): boolean {
  const inline = findItemInline(tokens, openIndex)
  if (!inline?.children) return false
  return inline.children.some(
    (child) =>
      child.type === 'html_inline' &&
      child.content.includes('task-list-item-checkbox') &&
      child.content.includes('checked='),
  )
}

/**
 * Remove the synthetic checkbox artefacts injected by markdown-it-task-lists
 * from the item opened at `openIndex`: the wrapping `<label>`/`</label>` and
 * `<input>` html_inline children, plus the leading space the plugin leaves on
 * the first real text child.
 */
function stripCheckboxArtefacts(tokens: Token[], openIndex: number): void {
  const inline = findItemInline(tokens, openIndex)
  if (!inline?.children) return

  const kept = inline.children.filter(
    (child) =>
      !(
        child.type === 'html_inline' &&
        (child.content.includes('task-list-item-checkbox') ||
          child.content === '<label>' ||
          child.content === '</label>')
      ),
  )
  // markdown-it-task-lists slices the marker but leaves a single leading space
  // on the first content token (e.g. " done"); trim it once.
  const first = kept[0]
  if (first && first.content.startsWith(' ')) {
    first.content = first.content.replace(/^ /, '')
  }
  inline.children = kept
  inline.content = inline.content.replace(/^\s*/, '')
}

/**
 * The inline token holding an item's content sits two tokens after the
 * `list_item_open` (item_open, paragraph_open, inline). Guard the shape.
 */
function findItemInline(tokens: Token[], openIndex: number): Token | undefined {
  const inline = tokens[openIndex + 2]
  return inline && inline.type === 'inline' ? inline : undefined
}

/**
 * Wrap each table cell's inline content in a paragraph.
 *
 * markdown-it emits `th`/`td` with their `inline` token directly inside, but
 * the schema's cells require `block+`. We splice a `paragraph_open`/
 * `paragraph_close` pair around each cell's inline run so cells contain a real
 * block. thead/tbody wrappers carry no document meaning and are dropped by the
 * parser's token spec (`ignore`).
 */
function lekhaTables(state: StateCore): boolean {
  const input = state.tokens
  const out: Token[] = []
  for (let i = 0; i < input.length; i++) {
    const token = input[i]
    if (!token) continue
    out.push(token)
    const isCellOpen = token.type === 'th_open' || token.type === 'td_open'
    const next = input[i + 1]
    if (isCellOpen && next && next.type === 'inline') {
      out.push(makeToken(state, 'paragraph_open', 'p', 1))
      out.push(next)
      out.push(makeToken(state, 'paragraph_close', 'p', -1))
      i++ // consumed the inline token
    }
  }
  state.tokens = out
  return true
}

/** Construct a fresh markdown-it token using the state's Token constructor. */
function makeToken(
  state: StateCore,
  type: string,
  tag: string,
  nesting: Nesting,
): Token {
  return new state.Token(type, tag, nesting)
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const tokenizer = MarkdownIt('commonmark', { html: false })
  .enable(['strikethrough', 'table'])
  .use(taskLists, { label: true })
  .use(mathPlugin)

// Run AFTER markdown-it-task-lists' `github-task-lists` rule so the
// `contains-task-list`/`task-list-item` classes it sets are present.
tokenizer.core.ruler.after('github-task-lists', 'lekha_task_lists', lekhaTaskLists)
tokenizer.core.ruler.after('lekha_task_lists', 'lekha_tables', lekhaTables)

// ---------------------------------------------------------------------------
// Token -> node/mark specs
// ---------------------------------------------------------------------------

/** Whether a list (looking forward from index `i`) renders tightly. */
function listIsTight(tokens: Token[], i: number): boolean {
  for (let j = i + 1; j < tokens.length; j++) {
    const token = tokens[j]
    if (!token) break
    if (token.type !== 'list_item_open' && token.type !== 'task_item_open') {
      return token.hidden
    }
  }
  return false
}

const tokens: Record<string, ParseSpec> = {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item' },
  bullet_list: {
    block: 'bullet_list',
    getAttrs: (_tok, toks, i) => ({ tight: listIsTight(toks, i) }),
  },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, toks, i) => ({
      order: Number(tok.attrGet('start')) || 1,
      tight: listIsTight(toks, i),
    }),
  },
  task_list: {
    block: 'task_list',
    getAttrs: (_tok, toks, i) => ({ tight: listIsTight(toks, i) }),
  },
  task_item: {
    block: 'task_item',
    getAttrs: (tok) => ({ checked: tok.attrGet('data-checked') === 'true' }),
  },
  heading: {
    block: 'heading',
    getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }),
  },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: {
    block: 'code_block',
    getAttrs: (tok) => ({ language: tok.info.trim().split(/\s+/)[0] ?? '' }),
    noCloseToken: true,
  },
  hr: { node: 'horizontal_rule' },
  image: {
    node: 'image',
    getAttrs: (tok) => ({
      src: tok.attrGet('src'),
      title: tok.attrGet('title') ?? null,
      alt: tok.children?.[0]?.content ?? null,
    }),
  },
  hardbreak: { node: 'hard_break' },
  softbreak: { node: 'hard_break' },

  // GFM tables. Cells receive a paragraph_open/close pair from `lekhaTables`,
  // satisfying the `block+` cell content. thead/tbody are document-noise.
  table: { block: 'table' },
  tr: { block: 'table_row' },
  th: { block: 'table_header' },
  td: { block: 'table_cell' },
  thead: { ignore: true },
  tbody: { ignore: true },

  // Math nodes. The math plugin emits single-token (nesting=0) tokens;
  // we use `node` (not `block`) so the parser creates a leaf node directly
  // from the token's content attribute.
  math_inline: { node: 'math_inline', getAttrs: (tok) => ({ latex: tok.content }) },
  math_block: { node: 'math_block', getAttrs: (tok) => ({ latex: tok.content }) },

  // Marks.
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strikethrough' },
  link: {
    mark: 'link',
    getAttrs: (tok) => ({
      href: tok.attrGet('href'),
      title: tok.attrGet('title') ?? null,
    }),
  },
  code_inline: { mark: 'code', noCloseToken: true },
}

const parser = new MarkdownParser(schema, tokenizer, tokens)

/** Parse a Markdown string into a ProseMirror document. */
export function parseMarkdown(md: string): Node {
  return parser.parse(md)
}
