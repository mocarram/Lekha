import {
  Schema,
  type NodeSpec,
  type MarkSpec,
  type DOMOutputSpec,
} from 'prosemirror-model'
import { schema as baseSchema } from 'prosemirror-markdown'
import { tableNodes } from 'prosemirror-tables'

/**
 * Lekha document schema.
 *
 * Built on top of the prosemirror-markdown baseline (doc, paragraph, heading,
 * blockquote, code_block, lists, image, hard_break, text + em/strong/code/link)
 * and extended with WYSIWYG's set: GFM task lists, GFM tables, and the
 * strikethrough mark. The SAME instance is imported by the parser and
 * serializer so the markdown engine has a single source of truth (DRY).
 */

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'block+',
  cellAttributes: {},
})

const taskList: NodeSpec = {
  group: 'block',
  // KNOWN FIX #1: content MUST be `(task_item | list_item)+`, NOT `task_item+`.
  // markdown-it merges adjacent same-marker lists into a single
  // `<ul class="contains-task-list">` that mixes plain `list_item`s with
  // checkbox items. With `task_item+` the plain items fail validation and the
  // WHOLE list is silently dropped (data loss). Allowing both keeps it intact.
  content: '(task_item | list_item)+',
  attrs: { tight: { default: false } },
  parseDOM: [
    {
      tag: 'ul.contains-task-list',
      getAttrs(dom: HTMLElement) {
        return { tight: dom.hasAttribute('data-tight') }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'ul',
      {
        class: 'contains-task-list',
        'data-tight': node.attrs['tight'] ? 'true' : null,
      },
      0,
    ]
  },
}

const taskItem: NodeSpec = {
  content: 'block+',
  defining: true,
  attrs: { checked: { default: false } },
  parseDOM: [
    {
      tag: 'li.task-list-item',
      getAttrs(dom: HTMLElement) {
        return { checked: dom.getAttribute('data-checked') === 'true' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'li',
      {
        class: 'task-list-item',
        'data-checked': node.attrs['checked'] ? 'true' : 'false',
      },
      0,
    ]
  },
}

const strikethrough: MarkSpec = {
  parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
  toDOM(): DOMOutputSpec {
    return ['s', 0]
  },
}

/**
 * Rebuild the baseline code_block spec so its language lives on a `language`
 * attribute (the baseline uses `params`). Keeps WYSIWYG's mental model and the
 * fenced-code serializer simple.
 */
const codeBlock: NodeSpec = {
  content: 'text*',
  group: 'block',
  code: true,
  defining: true,
  marks: '',
  attrs: { language: { default: '' } },
  parseDOM: [
    {
      tag: 'pre',
      preserveWhitespace: 'full',
      getAttrs(dom: HTMLElement) {
        return { language: dom.getAttribute('data-language') ?? '' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    const language = node.attrs['language'] as string
    return ['pre', language ? { 'data-language': language } : {}, ['code', 0]]
  },
}

/**
 * Inline math node: stores LaTeX source in a `latex` attr.
 * Rendered by the mathInlineNodeView as KaTeX output.
 * Atom + inline + selectable: ProseMirror treats it as a single cursor stop.
 */
const mathInline: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { latex: { default: '' } },
  parseDOM: [
    {
      tag: 'span.math-inline',
      getAttrs(dom: HTMLElement): { latex: string } {
        return { latex: dom.getAttribute('data-latex') ?? '' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return ['span', { class: 'math-inline', 'data-latex': node.attrs['latex'] as string }]
  },
}

/**
 * Block math node: stores LaTeX source in a `latex` attr.
 * Rendered by the mathBlockNodeView as a display-mode KaTeX formula.
 * Atom + selectable: treated as an opaque block.
 */
const mathBlock: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  attrs: { latex: { default: '' } },
  parseDOM: [
    {
      tag: 'div.math-block',
      getAttrs(dom: HTMLElement): { latex: string } {
        return { latex: dom.getAttribute('data-latex') ?? '' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return ['div', { class: 'math-block', 'data-latex': node.attrs['latex'] as string }]
  },
}

// Start from the baseline node map, override code_block, then append the
// WYSIWYG additions. baseSchema.spec.nodes is an OrderedMap whose
// `append`/`update` keep ordering deterministic.
const nodes = baseSchema.spec.nodes
  .update('code_block', codeBlock)
  .append({
    task_list: taskList,
    task_item: taskItem,
    table: tables.table,
    table_row: tables.table_row,
    table_cell: tables.table_cell,
    table_header: tables.table_header,
    math_inline: mathInline,
    math_block: mathBlock,
  })

const marks = baseSchema.spec.marks.append({ strikethrough })

export const schema = new Schema({ nodes, marks })
