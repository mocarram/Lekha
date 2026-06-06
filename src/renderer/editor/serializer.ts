import { type Node } from 'prosemirror-model'
import {
  MarkdownSerializer,
  type MarkdownSerializerState,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown'

/**
 * ProseMirror document -> Markdown serializer for Lekha.
 *
 * Extends the prosemirror-markdown baseline serializer with WYSIWYG's set:
 * fenced code blocks keyed on a `language` attr, the strikethrough mark, GFM
 * task lists (mixing plain and checkbox items), and GFM tables. Output is
 * canonical: ATX headings, `-` bullets, fenced (never indented) code.
 */

// ---------------------------------------------------------------------------
// Shared list rendering (KNOWN FIX #1)
// ---------------------------------------------------------------------------

/** First-line marker for one list child, by its node type. */
function listItemMarker(child: Node): string {
  if (child.type.name === 'task_item') {
    return child.attrs['checked'] ? '- [x] ' : '- [ ] '
  }
  return '- '
}

/**
 * Render a list whose children may be plain `list_item`s, `task_item`s, or a
 * mix of both (a `task_list` produced by merging adjacent same-marker lists).
 * Each child's first-line marker is chosen from its own type, so nothing is
 * dropped. Continuation lines indent by two spaces (canonical for `- `).
 *
 * Task lists are rendered TIGHT (no blank lines between items): that is the
 * canonical GFM/WYSIWYG form, and it collapses a loose-authored mix
 * (e.g. bullets, blank line, then checkboxes) into one compact block.
 */
function renderMixedList(state: MarkdownSerializerState, node: Node): void {
  const tight = node.type.create({ ...node.attrs, tight: true }, node.content)
  state.renderList(tight, '  ', (index) => listItemMarker(tight.child(index)))
}

// ---------------------------------------------------------------------------
// GFM table rendering
// ---------------------------------------------------------------------------

/** Serialize a single cell's content to inline Markdown, escaping table syntax. */
function serializeCell(cell: Node): string {
  // Forward reference: serializeCell calls serializeMarkdown which is defined
  // below (after the `const serializer` declaration). This is safe because
  // serializeCell is only ever invoked at serialize-time - i.e. when
  // renderTable is called by the MarkdownSerializer - at which point
  // serializeMarkdown has already been initialized in the module scope.
  const inline = serializeMarkdown(cell).trim()
  return inline.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Collect the serialized text of each cell in a table row. */
function rowCells(row: Node): string[] {
  const cells: string[] = []
  row.forEach((cell) => cells.push(serializeCell(cell)))
  return cells
}

/** Format one row's cells as `| a | b |`. */
function formatRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

/**
 * GFM separator-cell marker for a column's alignment:
 *   left -> `:---`, center -> `:--:`, right -> `---:`, none -> `---`.
 * Read from the header cell's `align` attr; the parser applies the same value
 * to every cell in the column, so the header is an authoritative source.
 */
function alignMarker(align: string | null): string {
  switch (align) {
    case 'left':
      return ':--'
    case 'center':
      return ':-:'
    case 'right':
      return '--:'
    default:
      return '---'
  }
}

/** Render a GFM table: header row, alignment separator, then body rows. */
function renderTable(state: MarkdownSerializerState, node: Node): void {
  const rows: Node[] = []
  node.forEach((row) => rows.push(row))
  const [header, ...body] = rows
  if (!header) return

  const headerCells = rowCells(header)
  const separators: string[] = []
  header.forEach((cell) =>
    separators.push(alignMarker((cell.attrs['align'] as string | null) ?? null)),
  )
  const lines = [
    formatRow(headerCells),
    formatRow(separators),
    ...body.map((row) => formatRow(rowCells(row))),
  ]
  // Write the whole table as one block; closeBlock terminates it without
  // leaving a trailing newline in the output (matching every other block).
  state.write(lines.join('\n'))
  state.closeBlock(node)
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,

    // Canonical fenced code, fence auto-grown past any backtick run within.
    code_block(state, node) {
      const backticks = node.textContent.match(/`{3,}/gm)
      const fence = backticks ? backticks.sort().slice(-1)[0] + '`' : '```'
      const language = (node.attrs['language'] as string) || ''
      state.write(fence + language + '\n')
      state.text(node.textContent, false)
      state.write('\n')
      state.write(fence)
      state.closeBlock(node)
    },

    // task_list renders BOTH child types via the shared helper.
    task_list(state, node) {
      renderMixedList(state, node)
    },
    task_item(state, node) {
      state.renderContent(node)
    },

    // bullet_list / list_item keep the canonical `-` marker.
    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ')
    },

    // Math: serialize back to the canonical dollar-fence syntax.
    // Inline math: $latex$ - no surrounding spaces, raw LaTeX content.
    math_inline(state, node) {
      state.write('$' + (node.attrs['latex'] as string) + '$')
    },
    // Block math: $$\nlatex\n$$ with a trailing closeBlock for blank line.
    math_block(state, node) {
      state.write('$$\n' + (node.attrs['latex'] as string) + '\n$$')
      state.closeBlock(node)
    },

    // YAML front-matter: emit `---\n<yaml>\n---` followed by a blank line.
    front_matter(state, node) {
      state.write('---\n')
      state.text(node.textContent, false)
      state.write('\n---')
      state.closeBlock(node)
    },

    // [TOC] atom: emit canonical lowercase `[toc]`.
    toc(state, node) {
      state.write('[toc]')
      state.closeBlock(node)
    },

    // Footnote inline reference: `[^label]`
    footnote_ref(state, node) {
      state.write('[^' + (node.attrs['label'] as string) + ']')
    },

    // Footnote definition block: `[^label]: <inline content>`
    // Serializes as `[^label]: text` on a single line.
    // Multi-paragraph footnotes are not supported in the MVP; only the first
    // paragraph's inline content is serialized (lossless for the common case).
    footnote_definition(state, node) {
      const label = node.attrs['label'] as string
      // Get the first paragraph's serialized text (inline-only, no block wrapper).
      // serializeMarkdown is a forward reference; it is safe because this
      // function is only called at serialize-time, after the module is initialized.
      const first = node.firstChild
      const inlineText = first ? serializeMarkdown(first).trim() : ''
      state.write('[^' + label + ']: ' + inlineText)
      state.closeBlock(node)
    },

    table(state, node) {
      renderTable(state, node)
    },
    // Rows/cells are rendered by `renderTable`; provide no-op handlers so the
    // serializer never errors on a stray descendant walk.
    table_row() {},
    table_cell(state, node) {
      state.renderContent(node)
    },
    table_header(state, node) {
      state.renderContent(node)
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    strikethrough: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    // Extended inline marks.
    highlight: { open: '==', close: '==', mixable: true, expelEnclosingWhitespace: true },
    subscript: { open: '~', close: '~', mixable: true },
    superscript: { open: '^', close: '^', mixable: true },
    // Underline has no Markdown syntax - emit raw <u> HTML (WYSIWYG-style).
    underline: { open: '<u>', close: '</u>', mixable: true, expelEnclosingWhitespace: true },
  },
)

/** Serialize a ProseMirror document to Markdown. */
export function serializeMarkdown(doc: Node): string {
  return serializer.serialize(doc)
}
