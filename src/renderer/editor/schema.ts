import { Schema } from 'prosemirror-model'

/**
 * Lekha document schema.
 *
 * Nodes mirror prosemirror-schema-basic plus heading levels, code_block, and
 * blockquote. Marks mirror the basic set plus strikethrough. Defined here
 * explicitly so Lekha does not depend on prosemirror-schema-basic.
 */
export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },

    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM() {
        return ['p', 0]
      },
    },

    blockquote: {
      group: 'block',
      content: 'block+',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM() {
        return ['blockquote', 0]
      },
    },

    horizontal_rule: {
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM() {
        return ['hr']
      },
    },

    heading: {
      group: 'block',
      content: 'inline*',
      attrs: { level: { default: 1 } },
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((i) => ({
        tag: `h${i}`,
        attrs: { level: i },
      })),
      toDOM(node) {
        return [`h${node.attrs['level'] as number}`, 0]
      },
    },

    code_block: {
      group: 'block',
      content: 'text*',
      marks: '',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM() {
        return ['pre', ['code', 0]]
      },
    },

    text: { group: 'inline' },

    image: {
      group: 'inline',
      inline: true,
      draggable: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs(dom) {
            return {
              src: dom.getAttribute('src'),
              alt: dom.getAttribute('alt'),
              title: dom.getAttribute('title'),
            }
          },
        },
      ],
      toDOM(node) {
        return ['img', node.attrs]
      },
    },

    hard_break: {
      group: 'inline',
      inline: true,
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM() {
        return ['br']
      },
    },
  },

  marks: {
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom) {
            return { href: dom.getAttribute('href'), title: dom.getAttribute('title') }
          },
        },
      ],
      toDOM(node) {
        return ['a', node.attrs, 0]
      },
    },

    em: {
      parseDOM: [{ tag: 'i' }, { tag: 'em' }, { style: 'font-style=italic' }],
      toDOM() {
        return ['em', 0]
      },
    },

    strong: {
      parseDOM: [
        { tag: 'strong' },
        {
          tag: 'b',
          getAttrs(node) {
            return node.style.fontWeight !== 'normal' ? null : false
          },
        },
        {
          style: 'font-weight',
          getAttrs(value) {
            return /^(bold(er)?|[5-9]\d{2,})$/.test(value) ? null : false
          },
        },
      ],
      toDOM() {
        return ['strong', 0]
      },
    },

    code: {
      parseDOM: [{ tag: 'code' }],
      toDOM() {
        return ['code', 0]
      },
    },

    strikethrough: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
      toDOM() {
        return ['s', 0]
      },
    },
  },
})
