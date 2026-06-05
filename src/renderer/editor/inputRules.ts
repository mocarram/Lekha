import {
  inputRules,
  InputRule,
  textblockTypeInputRule,
} from 'prosemirror-inputrules'
import { type MarkType, type NodeType } from 'prosemirror-model'
import { schema } from './schema'

/**
 * Create an InputRule that wraps matched text in the given mark.
 *
 * The regex must have a capture group for the inner text.
 * For alternation regexes (e.g. /a(x)a$|b(y)b$/) the captured text
 * may land in match[1] or match[2] depending on which branch fired,
 * so we take the first defined group.
 */
function markInputRule(regex: RegExp, markType: MarkType): InputRule {
  return new InputRule(regex, (state, match, start, end) => {
    const inner = match[1] ?? match[2]
    if (!inner) return null
    const mark = markType.create()
    const tr = state.tr
      .replaceWith(start, end, schema.text(inner, [mark]))
    return tr
  })
}

/** Retrieve a mark type that is guaranteed to exist in our schema. */
function mark(name: string): MarkType {
  const mt = schema.marks[name]
  if (!mt) throw new Error(`Unknown mark type: ${name}`)
  return mt
}

/** Retrieve a node type that is guaranteed to exist in our schema. */
function node(name: string): NodeType {
  const nt = schema.nodes[name]
  if (!nt) throw new Error(`Unknown node type: ${name}`)
  return nt
}

// **bold** and __bold__
const strongRule = markInputRule(/\*\*([^*]+)\*\*$|__([^_]+)__$/, mark('strong'))

// *italic* and _italic_
const emRule = markInputRule(/(?<!\*)\*([^*]+)\*$|(?<!_)_([^_]+)_$/, mark('em'))

// `code`
const codeRule = markInputRule(/`([^`]+)`$/, mark('code'))

// ~~strikethrough~~
const strikethroughRule = markInputRule(/~~([^~]+)~~$/, mark('strikethrough'))

// # Heading 1 through ###### Heading 6
function headingRule(nodeType: NodeType, maxLevel: number): InputRule {
  return textblockTypeInputRule(
    new RegExp(`^(#{1,${maxLevel}})\\s$`),
    nodeType,
    (match) => ({ level: match[1]?.length ?? 1 }),
  )
}

/** The raw rule list, exported for unit testing. */
export const markRules: InputRule[] = [
  strongRule,
  emRule,
  codeRule,
  strikethroughRule,
]

export function buildInputRules() {
  return inputRules({
    rules: [
      ...markRules,
      headingRule(node('heading'), 6),
    ],
  })
}
