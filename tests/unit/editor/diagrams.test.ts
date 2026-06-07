/**
 * diagrams.test.ts
 *
 * TDD tests for the live mermaid diagram rendering feature.
 * Tests cover:
 *   1. Round-trip sanity (mermaid code blocks are just code blocks with language='mermaid')
 *   2. mermaid.ts wrapper: renderMermaid() returns {svg} on success, {error} on failure
 *   3. codeBlockNodeView: DOM structure for mermaid blocks (contentDOM + .diagram-preview)
 *   4. codeBlockNodeView: no .diagram-preview for non-diagram languages
 *   5. Editing the source still works (contentDOM receives text via dispatch)
 *   6. Highlight plugin still decorates code_block source without throwing
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import type { DecorationSet } from 'prosemirror-view'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'
import {
  highlightPlugin,
  whenLanguagesReady,
} from '../../../src/renderer/editor/plugins/highlight'

// The lowlight grammar set is lazy-loaded (dynamic import). Resolve it up front
// so the synchronous highlightPlugin assertions below see decorations exactly as
// they did when grammars were loaded eagerly at module scope.
beforeAll(async () => {
  await whenLanguagesReady()
})

// ---------------------------------------------------------------------------
// Mock mermaid BEFORE importing renderMermaid so the module sees the mock.
// ---------------------------------------------------------------------------

vi.mock('mermaid', () => {
  return {
    default: {
      initialize: vi.fn(),
      render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>', diagramType: 'flowchart' }),
    },
  }
})

// ---------------------------------------------------------------------------
// Round-trip sanity
// ---------------------------------------------------------------------------

describe('mermaid round-trip', () => {
  const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

  it('```mermaid block round-trips unchanged', () => {
    const md = '```mermaid\ngraph TD;A-->B;\n```'
    expect(rt(md)).toBe(md)
  })

  it('```mermaid block parses as code_block with language=mermaid', () => {
    const doc = parseMarkdown('```mermaid\ngraph TD;A-->B;\n```')
    let found: { language: string; text: string } | null = null
    doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        found = { language: node.attrs['language'] as string, text: node.textContent }
        return false
      }
      return true
    })
    expect(found).not.toBeNull()
    expect(found!.language).toBe('mermaid')
    expect(found!.text).toBe('graph TD;A-->B;')
  })
})

// ---------------------------------------------------------------------------
// renderMermaid wrapper
// ---------------------------------------------------------------------------

describe('renderMermaid', () => {
  it('returns {svg} when mermaid.render resolves', async () => {
    const { renderMermaid } = await import('../../../src/renderer/editor/mermaid')
    const result = await renderMermaid('test-id-1', 'graph TD;A-->B;')
    expect(result).toHaveProperty('svg')
    expect((result as { svg: string }).svg).toContain('<svg')
  })

  it('returns {error} when mermaid.render rejects', async () => {
    const mermaidMod = await import('mermaid')
    const mockedRender = vi.mocked(mermaidMod.default.render)
    mockedRender.mockRejectedValueOnce(new Error('syntax error'))

    const { renderMermaid } = await import('../../../src/renderer/editor/mermaid')
    const result = await renderMermaid('test-id-2', 'invalid mermaid!!!')
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toBeTruthy()
  })

  it('uses unique ids on successive calls (no collision)', async () => {
    const mermaidMod = await import('mermaid')
    const mockedRender = vi.mocked(mermaidMod.default.render)
    const usedIds: string[] = []
    mockedRender.mockImplementation((id: string) => {
      usedIds.push(id)
      return Promise.resolve({ svg: '<svg/>', diagramType: 'flowchart' })
    })

    const { renderMermaid } = await import('../../../src/renderer/editor/mermaid')
    await renderMermaid('', 'graph TD;A-->B;')
    await renderMermaid('', 'graph TD;B-->C;')

    expect(usedIds.length).toBe(2)
    expect(usedIds[0]).not.toBe(usedIds[1])
  })
})

// ---------------------------------------------------------------------------
// codeBlockNodeView DOM structure
// ---------------------------------------------------------------------------

/** Build a minimal ProseMirror view with the codeBlockNodeView registered. */
async function mountCodeBlockView(markdown: string): Promise<EditorView> {
  const { codeBlockNodeView } = await import(
    '../../../src/renderer/editor/codeBlockNodeView'
  )
  const doc = parseMarkdown(markdown)
  const state = EditorState.create({ schema, doc })
  const domEl = document.createElement('div')
  document.body.appendChild(domEl)
  return new EditorView(domEl, {
    state,
    nodeViews: { code_block: codeBlockNodeView },
  })
}

describe('codeBlockNodeView - mermaid block', () => {
  let view: EditorView | null = null

  beforeEach(() => {
    view = null
  })

  afterEach(() => {
    view?.destroy()
    view = null
    document.body.innerHTML = ''
  })

  it('renders a <pre class="code-block"><code> for the editable source', async () => {
    view = await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')
    const codeEl = document.querySelector('pre.code-block > code')
    expect(codeEl).not.toBeNull()
  })

  it('renders a .diagram-preview container for mermaid language', async () => {
    view = await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')
    const preview = document.querySelector('.diagram-preview')
    expect(preview).not.toBeNull()
  })

  it('adds the is-diagram class to the wrapper for mermaid blocks', async () => {
    view = await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')
    const wrapper = document.querySelector('.code-block-wrapper')
    expect(wrapper).not.toBeNull()
    expect(wrapper!.classList.contains('is-diagram')).toBe(true)
  })

  it('invokes mermaid.render when mounting a mermaid block (after debounce)', async () => {
    const mermaidMod = await import('mermaid')
    const mockedRender = vi.mocked(mermaidMod.default.render)
    mockedRender.mockClear()
    mockedRender.mockResolvedValue({ svg: '<svg>mock-diagram</svg>', diagramType: 'flowchart' })

    view = await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')

    // Wait for the debounced render (250 ms + slack)
    await new Promise<void>((resolve) => setTimeout(resolve, 350))

    expect(mockedRender).toHaveBeenCalled()
  })
})

describe('codeBlockNodeView - non-diagram language', () => {
  let view: EditorView | null = null

  beforeEach(() => {
    view = null
  })

  afterEach(() => {
    view?.destroy()
    view = null
    document.body.innerHTML = ''
  })

  it('does NOT render a .diagram-preview for a js code block', async () => {
    view = await mountCodeBlockView('```js\nconst x = 1;\n```')
    const preview = document.querySelector('.diagram-preview')
    expect(preview).toBeNull()
  })

  it('does NOT add the is-diagram class for a js code block', async () => {
    view = await mountCodeBlockView('```js\nconst x = 1;\n```')
    const wrapper = document.querySelector('.code-block-wrapper')
    expect(wrapper).not.toBeNull()
    expect(wrapper!.classList.contains('is-diagram')).toBe(false)
  })

  it('renders a <pre class="code-block"><code> for js blocks (source only)', async () => {
    view = await mountCodeBlockView('```js\nconst x = 1;\n```')
    const codeEl = document.querySelector('pre.code-block > code')
    expect(codeEl).not.toBeNull()
  })

  it('does NOT render a .diagram-preview for a plain code block', async () => {
    view = await mountCodeBlockView('```\nplain text\n```')
    const preview = document.querySelector('.diagram-preview')
    expect(preview).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Editing the source via contentDOM
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - contentDOM is editable', () => {
  let view: EditorView | null = null

  beforeEach(() => {
    view = null
  })

  afterEach(() => {
    view?.destroy()
    view = null
    document.body.innerHTML = ''
  })

  it('dispatching a text insertion into the code_block updates doc text', async () => {
    view = await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')

    // Find the code_block position
    let blockPos = -1
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') {
        blockPos = pos
        return false
      }
      return true
    })
    expect(blockPos).toBeGreaterThanOrEqual(0)

    // Insert 'X' at the start of the code block content (pos + 1)
    const insertPos = blockPos + 1
    view.dispatch(view.state.tr.insertText('X', insertPos))

    // Doc should now contain 'X' prepended in the code block text
    let newText = ''
    view.state.doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        newText = node.textContent
        return false
      }
      return true
    })
    expect(newText).toContain('X')
  })

  it('does not destroy the contentDOM element on update (editing stays alive)', async () => {
    view = await mountCodeBlockView('```mermaid\ngraph TD;\n```')

    const codeElBefore = document.querySelector('pre.code-block > code')
    expect(codeElBefore).not.toBeNull()

    // Dispatch a no-op tr that touches attrs to trigger update()
    let blockPos = -1
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') { blockPos = pos; return false }
      return true
    })
    // setNodeMarkup with the same attrs triggers update() on the NodeView
    view.dispatch(
      view.state.tr.setNodeMarkup(blockPos, undefined, { language: 'mermaid' }),
    )

    const codeElAfter = document.querySelector('pre.code-block > code')
    expect(codeElAfter).not.toBeNull()
    // The same DOM element should still be in the tree (not replaced)
    expect(codeElAfter).toBe(codeElBefore)
  })
})

// ---------------------------------------------------------------------------
// Highlight plugin still applies to code_block source
// ---------------------------------------------------------------------------

describe('highlightPlugin still decorates code_block source', () => {
  it('does not throw when called on a doc containing a mermaid block', () => {
    const doc = parseMarkdown('```mermaid\ngraph TD;A-->B;\n```')
    const plugin = highlightPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    expect(() => plugin.props.decorations?.call(plugin, state)).not.toThrow()
  })

  it('produces decorations for a js block in a doc that also has a mermaid block', () => {
    const doc = parseMarkdown(
      '```mermaid\ngraph TD;A-->B;\n```\n\n```js\nconst x = 1\n```',
    )
    const plugin = highlightPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const decos = plugin.props.decorations?.call(plugin, state) as DecorationSet | undefined
    expect(decos).toBeTruthy()
    // The js block should produce at least one highlight decoration
    expect(decos!.find().length).toBeGreaterThan(0)
  })
})
