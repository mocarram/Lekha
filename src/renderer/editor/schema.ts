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
  // Per-cell column alignment (`null | 'left' | 'center' | 'right'`). Mirrors
  // GFM's per-column alignment, which the parser reads from markdown-it's
  // `text-align` style and the serializer renders back into the `:--`/`:-:`/
  // `--:` separator markers. getFromDOM/setDOMAttr keep copy-paste and the
  // rendered table visually aligned.
  cellAttributes: {
    align: {
      default: null,
      getFromDOM(dom: HTMLElement): string | null {
        return dom.style.textAlign || null
      },
      setDOMAttr(value: unknown, attrs: Record<string, unknown>): void {
        // `align` is always one of the allowed string keywords or null; only a
        // truthy string contributes a `text-align` declaration.
        if (typeof value === 'string' && value) {
          const existing = typeof attrs['style'] === 'string' ? attrs['style'] : ''
          attrs['style'] = `${existing}text-align:${value};`
        }
      },
    },
  },
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

/** Extended-inline highlight mark: `==text==` <-> `<mark>`. */
const highlight: MarkSpec = {
  parseDOM: [{ tag: 'mark' }],
  toDOM(): DOMOutputSpec {
    return ['mark', 0]
  },
}

/** Extended-inline subscript mark: `~text~` <-> `<sub>`. */
const subscript: MarkSpec = {
  parseDOM: [{ tag: 'sub' }],
  toDOM(): DOMOutputSpec {
    return ['sub', 0]
  },
}

/** Extended-inline superscript mark: `^text^` <-> `<sup>`. */
const superscript: MarkSpec = {
  parseDOM: [{ tag: 'sup' }],
  toDOM(): DOMOutputSpec {
    return ['sup', 0]
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

/**
 * YAML front-matter block. Only valid as the first node in the document.
 * Stores the raw YAML as text content so it is fully editable and round-trips
 * losslessly: serialize emits `---\n<yaml>\n---`.
 *
 * Implemented as a code-like block (code: true, marks: '') so ProseMirror
 * treats its text content as literal (no inline marks), and the NodeView can
 * render it as a monospace, editable YAML region.
 */
const frontMatter: NodeSpec = {
  group: 'block',
  content: 'text*',
  code: true,
  defining: true,
  marks: '',
  attrs: {},
  parseDOM: [
    {
      tag: 'div.front-matter',
      preserveWhitespace: 'full',
    },
  ],
  toDOM(): DOMOutputSpec {
    return ['div', { class: 'front-matter' }, ['pre', 0]]
  },
}

/**
 * Table of contents atom. Serializes to `[toc]`.
 * The NodeView renders live TOC entries derived from the document's headings.
 */
const toc: NodeSpec = {
  group: 'block',
  atom: true,
  selectable: true,
  attrs: {},
  parseDOM: [{ tag: 'div.toc' }],
  toDOM(): DOMOutputSpec {
    return ['div', { class: 'toc' }]
  },
}

/**
 * Inline footnote reference: `[^id]` in source.
 * Rendered as a superscript marker. The `label` attr holds the raw label text.
 */
const footnoteRef: NodeSpec = {
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  attrs: { label: { default: '' } },
  parseDOM: [
    {
      tag: 'sup.footnote-ref',
      getAttrs(dom: HTMLElement): { label: string } {
        return { label: dom.getAttribute('data-label') ?? '' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return [
      'sup',
      { class: 'footnote-ref', 'data-label': node.attrs['label'] as string },
      `[^${node.attrs['label'] as string}]`,
    ]
  },
}

/**
 * Block footnote definition: `[^id]: content` in source.
 * Holds block content (paragraph, etc.). The `label` attr identifies the note.
 */
const footnoteDefinition: NodeSpec = {
  group: 'block',
  content: 'block+',
  defining: true,
  attrs: { label: { default: '' } },
  parseDOM: [
    {
      tag: 'div.footnote-def',
      getAttrs(dom: HTMLElement): { label: string } {
        return { label: dom.getAttribute('data-label') ?? '' }
      },
    },
  ],
  toDOM(node): DOMOutputSpec {
    return ['div', { class: 'footnote-def', 'data-label': node.attrs['label'] as string }, 0]
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
    front_matter: frontMatter,
    toc: toc,
    footnote_ref: footnoteRef,
    footnote_definition: footnoteDefinition,
  })

const marks = baseSchema.spec.marks.append({
  strikethrough,
  highlight,
  subscript,
  superscript,
})

export const schema = new Schema({ nodes, marks })
