/**
 * codeBlockControls.test.ts
 *
 * TDD tests for the code block header bar (language selector + copy button).
 *
 * Covers:
 *   1. The NodeView renders a header bar with a language control and a copy button
 *   2. The language control reflects the current language attr
 *   3. Changing the language control dispatches setNodeAttribute (updates doc)
 *   4. Clicking copy calls window.lekha.writeClipboard with the code text
 *   5. Editing the source (typing) still works - contentDOM stays editable
 *   6. ignoreMutation ignores mutations inside the header bar
 *   7. Language selector reflects 'mermaid' for diagram blocks
 *   8. Plain-text blocks show 'plaintext' (or empty) in the selector
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView, type NodeView } from 'prosemirror-view'
import { schema } from '../../../src/renderer/editor/schema'
import { parseMarkdown } from '../../../src/renderer/editor/parser'

// ---------------------------------------------------------------------------
// Mock mermaid BEFORE importing the NodeView so the module sees the mock.
// ---------------------------------------------------------------------------

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mock</svg>', diagramType: 'flowchart' }),
  },
}))

// ---------------------------------------------------------------------------
// Mock window.lekha.writeClipboard
// ---------------------------------------------------------------------------

const mockWriteClipboard = vi.fn().mockResolvedValue(undefined)

// ---------------------------------------------------------------------------
// Helper: mount a ProseMirror view with the codeBlockNodeView
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockWriteClipboard.mockClear()
  // Install the mock on window
  Object.defineProperty(window, 'lekha', {
    value: { writeClipboard: mockWriteClipboard },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

// ---------------------------------------------------------------------------
// 1. Header bar presence
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - header bar', () => {
  it('renders a .code-block-header element inside the wrapper', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')
    const header = document.querySelector('.code-block-wrapper .code-block-header')
    expect(header).not.toBeNull()
  })

  it('the header has contenteditable="false"', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')
    const header = document.querySelector<HTMLDivElement>('.code-block-header')
    expect(header).not.toBeNull()
    expect(header!.contentEditable).toBe('false')
  })

  it('renders a language selector inside the header', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')
    const selector = document.querySelector('.code-block-header .lang-selector')
    expect(selector).not.toBeNull()
  })

  it('renders a copy button inside the header', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')
    const btn = document.querySelector('.code-block-header .copy-btn')
    expect(btn).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Language selector reflects current language
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - language selector value', () => {
  it('shows the block language in the selector (js block)', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')
    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()
    // The selector value should reflect 'js' or 'javascript' (the attr stored)
    expect(selector!.value).toBeTruthy()
  })

  it('shows mermaid in the selector for a mermaid block', async () => {
    await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')
    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()
    expect(selector!.value).toBe('mermaid')
  })

  it('shows plaintext for a block with no language', async () => {
    await mountCodeBlockView('```\nsome plain text\n```')
    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()
    // Empty language -> shown as 'plaintext'
    expect(selector!.value).toBe('plaintext')
  })
})

// ---------------------------------------------------------------------------
// 3. Changing language selector dispatches setNodeAttribute
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - language change dispatch', () => {
  it('changing the selector updates the node language attr in the doc', async () => {
    const view = await mountCodeBlockView('```js\nconst x = 1;\n```')

    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()

    // Simulate selecting 'python'
    selector!.value = 'python'
    selector!.dispatchEvent(new Event('change', { bubbles: true }))

    // The code_block node in the doc should now have language='python'
    let foundLang: string | null = null
    view.state.doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        foundLang = node.attrs['language'] as string
        return false
      }
      return true
    })
    expect(foundLang).toBe('python')
  })

  it('selecting plaintext sets language to "" (empty string)', async () => {
    const view = await mountCodeBlockView('```js\nconst x = 1;\n```')

    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()

    selector!.value = 'plaintext'
    selector!.dispatchEvent(new Event('change', { bubbles: true }))

    let foundLang: string | null = null
    view.state.doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        foundLang = node.attrs['language'] as string
        return false
      }
      return true
    })
    // 'plaintext' maps to empty string attr
    expect(foundLang).toBe('')
  })
})

// ---------------------------------------------------------------------------
// 4. Copy button calls writeClipboard
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - copy button', () => {
  it('clicking copy button calls window.lekha.writeClipboard with the block text', async () => {
    await mountCodeBlockView('```js\nconst x = 1;\n```')

    const btn = document.querySelector<HTMLButtonElement>('.copy-btn')
    expect(btn).not.toBeNull()

    btn!.click()

    expect(mockWriteClipboard).toHaveBeenCalledOnce()
    const callArg = mockWriteClipboard.mock.calls[0]?.[0] as { text: string } | undefined
    expect(callArg).toBeDefined()
    expect(callArg!.text).toContain('const x = 1')
  })

  it('copy button works for mermaid block too', async () => {
    await mountCodeBlockView('```mermaid\ngraph TD;A-->B;\n```')

    const btn = document.querySelector<HTMLButtonElement>('.copy-btn')
    expect(btn).not.toBeNull()

    btn!.click()

    expect(mockWriteClipboard).toHaveBeenCalledOnce()
    const callArg = mockWriteClipboard.mock.calls[0]?.[0] as { text: string } | undefined
    expect(callArg!.text).toContain('graph TD')
  })
})

// ---------------------------------------------------------------------------
// 5. Editing the source still works
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - contentDOM still editable', () => {
  it('dispatching a text insertion into the code_block updates doc text', async () => {
    const view = await mountCodeBlockView('```js\nconst x = 1;\n```')

    let blockPos = -1
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') {
        blockPos = pos
        return false
      }
      return true
    })
    expect(blockPos).toBeGreaterThanOrEqual(0)

    view.dispatch(view.state.tr.insertText('HELLO', blockPos + 1))

    let newText = ''
    view.state.doc.descendants((node) => {
      if (node.type.name === 'code_block') {
        newText = node.textContent
        return false
      }
      return true
    })
    expect(newText).toContain('HELLO')
  })

  it('contentDOM element survives a language update (not replaced)', async () => {
    const view = await mountCodeBlockView('```js\nconst x = 1;\n```')

    const codeElBefore = document.querySelector('pre.code-block > code')
    expect(codeElBefore).not.toBeNull()

    let blockPos = -1
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') { blockPos = pos; return false }
      return true
    })

    view.dispatch(
      view.state.tr.setNodeMarkup(blockPos, undefined, { language: 'python' }),
    )

    const codeElAfter = document.querySelector('pre.code-block > code')
    expect(codeElAfter).not.toBeNull()
    expect(codeElAfter).toBe(codeElBefore)
  })
})

// ---------------------------------------------------------------------------
// 6. ignoreMutation scoping - header mutations are ignored
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - ignoreMutation scoping', () => {
  it('a childList mutation inside the header is ignored (returns true)', async () => {
    const { codeBlockNodeView } = await import(
      '../../../src/renderer/editor/codeBlockNodeView'
    )

    const doc = parseMarkdown('```js\nconst x = 1;\n```')
    const state = EditorState.create({ schema, doc })
    const domEl = document.createElement('div')
    document.body.appendChild(domEl)

    let capturedNodeView: NodeView | null = null
    const view = new EditorView(domEl, {
      state,
      nodeViews: {
        code_block: (node, v, getPos, decos, innerDecos) => {
          capturedNodeView = codeBlockNodeView(node, v, getPos, decos, innerDecos)
          return capturedNodeView
        },
      },
    })

    expect(capturedNodeView).not.toBeNull()

    const header = domEl.querySelector('.code-block-header')
    expect(header).not.toBeNull()

    // Simulate a mutation record targeting a node inside the header
    const fakeTarget = header!.querySelector('.lang-selector') ?? header!
    const fakeMutation = {
      type: 'childList',
      target: fakeTarget,
      addedNodes: document.createDocumentFragment().childNodes,
      removedNodes: document.createDocumentFragment().childNodes,
      previousSibling: null,
      nextSibling: null,
      attributeName: null,
      attributeNamespace: null,
      oldValue: null,
    } as unknown as MutationRecord

    expect(capturedNodeView!.ignoreMutation?.(fakeMutation)).toBe(true)

    view.destroy()
  })

  it('a mutation inside contentDOM is NOT ignored (returns false)', async () => {
    const { codeBlockNodeView } = await import(
      '../../../src/renderer/editor/codeBlockNodeView'
    )

    const doc = parseMarkdown('```js\nconst x = 1;\n```')
    const state = EditorState.create({ schema, doc })
    const domEl = document.createElement('div')
    document.body.appendChild(domEl)

    let capturedNodeView: NodeView | null = null
    const view = new EditorView(domEl, {
      state,
      nodeViews: {
        code_block: (node, v, getPos, decos, innerDecos) => {
          capturedNodeView = codeBlockNodeView(node, v, getPos, decos, innerDecos)
          return capturedNodeView
        },
      },
    })

    expect(capturedNodeView).not.toBeNull()

    const codeEl = domEl.querySelector('pre.code-block > code')
    expect(codeEl).not.toBeNull()

    const fakeMutation = {
      type: 'characterData',
      target: codeEl!,
      addedNodes: document.createDocumentFragment().childNodes,
      removedNodes: document.createDocumentFragment().childNodes,
      previousSibling: null,
      nextSibling: null,
      attributeName: null,
      attributeNamespace: null,
      oldValue: null,
    } as unknown as MutationRecord

    // contentDOM mutations must NOT be ignored
    expect(capturedNodeView!.ignoreMutation?.(fakeMutation)).toBe(false)

    view.destroy()
  })
})

// ---------------------------------------------------------------------------
// 7. update() reflects language change in selector
// ---------------------------------------------------------------------------

describe('codeBlockNodeView - update() syncs selector', () => {
  it('selector value updates when the language attr changes via dispatch', async () => {
    const view = await mountCodeBlockView('```js\nconst x = 1;\n```')

    let blockPos = -1
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'code_block') { blockPos = pos; return false }
      return true
    })

    view.dispatch(
      view.state.tr.setNodeMarkup(blockPos, undefined, { language: 'rust' }),
    )

    const selector = document.querySelector<HTMLSelectElement>('.lang-selector')
    expect(selector).not.toBeNull()
    expect(selector!.value).toBe('rust')
  })
})
