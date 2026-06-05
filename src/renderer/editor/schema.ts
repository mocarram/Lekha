import { Schema } from 'prosemirror-model'
import { schema as basicSchema } from 'prosemirror-schema-basic'

// Extend the basic schema with a strikethrough mark
export const schema = new Schema({
  nodes: basicSchema.spec.nodes,
  marks: {
    ...basicSchema.spec.marks.toObject(),
    strikethrough: {
      parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
      toDOM() {
        return ['s', 0] as const
      },
    },
  },
})
