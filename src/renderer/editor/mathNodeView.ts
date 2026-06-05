/**
 * mathNodeView.ts
 *
 * Reusable NodeView factory for math_inline and math_block nodes.
 *
 * Each math node renders in two states:
 *
 *   RENDERED (default):
 *     KaTeX renders the LaTeX into the DOM. Clicking the rendered element
 *     (or selecting it as a NodeSelection) switches to EDIT state.
 *     Empty latex -> a muted placeholder ("$ $" / "Empty math block").
 *     KaTeX errors -> KaTeX's own error span (throwOnError:false).
 *
 *   EDIT:
 *     An <input> (inline) or <textarea> (block) appears, pre-filled with the
 *     current LaTeX. Typing dispatches setNodeAttribute transactions so the
 *     doc stays live. Blur / Escape / Enter-for-inline returns to RENDERED.
 *     For block, a small live-preview div is shown below the textarea.
 *
 * Design goals (also serves future "Diagrams" feature):
 *   - Single factory function parameterized by { isBlock }.
 *   - The "atom node with editable source + live render" pattern is explicit
 *     and self-contained: other node types can replicate it.
 *   - No `any`; strict TypeScript throughout.
 *   - stopEvent / ignoreMutation: return true so PM doesn't fight the inner
 *     editor for cursor / DOM mutation ownership.
 */

import katex from 'katex'
import { type Node } from 'prosemirror-model'
import { type EditorView, type NodeView, type NodeViewConstructor } from 'prosemirror-view'

// ---------------------------------------------------------------------------
// KaTeX rendering helper
// ---------------------------------------------------------------------------

/**
 * Render `latex` into `container` using KaTeX.
 * On empty latex, insert a muted placeholder.
 * KaTeX errors are rendered as KaTeX's own error span (throwOnError:false).
 *
 * Uses `renderToString` + `innerHTML` assignment for maximum compatibility
 * across environments (including happy-dom in tests). The `render()` API
 * modifies the container in place but may behave differently in non-browser
 * environments.
 */
function renderKatex(
  container: HTMLElement,
  latex: string,
  displayMode: boolean,
): void {
  if (!latex.trim()) {
    // Placeholder for empty math
    container.innerHTML = ''
    const placeholder = document.createElement('span')
    placeholder.className = 'math-placeholder'
    placeholder.textContent = displayMode ? 'Empty math block' : '$ $'
    container.appendChild(placeholder)
    return
  }

  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
    })
    container.innerHTML = html
  } catch {
    // Should not happen (throwOnError:false), but guard anyway
    container.textContent = latex
  }
}

// ---------------------------------------------------------------------------
// Shared factory
// ---------------------------------------------------------------------------

interface MathNodeViewOptions {
  isBlock: boolean
}

/**
 * Creates a NodeView for a math node (inline or block).
 *
 * Designed as a reusable factory: pass `{ isBlock: true }` for math_block,
 * `{ isBlock: false }` for math_inline. Future "atom node with live render"
 * node types (diagrams, mermaid, etc.) can follow the same pattern.
 */
function makeMathNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
  { isBlock }: MathNodeViewOptions,
): NodeView {
  // Outer wrapper - contenteditable=false so PM doesn't manage inner DOM
  const dom = isBlock
    ? document.createElement('div')
    : document.createElement('span')
  dom.setAttribute('contenteditable', 'false')
  dom.className = isBlock ? 'math-block' : 'math-inline'

  // Rendered output container
  const renderContainer = isBlock
    ? document.createElement('div')
    : document.createElement('span')
  renderContainer.className = 'math-render'
  dom.appendChild(renderContainer)

  // Edit container (hidden until edit mode)
  const editContainer = isBlock
    ? document.createElement('div')
    : document.createElement('span')
  editContainer.className = 'math-edit'
  editContainer.style.display = 'none'
  dom.appendChild(editContainer)

  // The source editor: textarea for block, input for inline
  let sourceEditor: HTMLTextAreaElement | HTMLInputElement

  if (isBlock) {
    const ta = document.createElement('textarea')
    ta.className = 'math-source'
    ta.rows = 4
    ta.spellcheck = false
    editContainer.appendChild(ta)
    sourceEditor = ta
  } else {
    const inp = document.createElement('input')
    inp.type = 'text'
    inp.className = 'math-source'
    inp.spellcheck = false
    editContainer.appendChild(inp)
    sourceEditor = inp
  }

  // For block: live preview under the textarea
  let blockPreview: HTMLDivElement | null = null
  if (isBlock) {
    blockPreview = document.createElement('div')
    blockPreview.className = 'math-preview'
    editContainer.appendChild(blockPreview)
  }

  // Current latex (kept in sync with node.attrs.latex)
  let currentLatex = node.attrs['latex'] as string

  // ---------------------------------------------------------------------------
  // Render / edit state management
  // ---------------------------------------------------------------------------

  let isEditing = false

  function enterEditMode(): void {
    if (isEditing) return
    isEditing = true
    renderContainer.style.display = 'none'
    editContainer.style.display = isBlock ? 'block' : 'inline-block'
    sourceEditor.value = currentLatex
    if (blockPreview) renderKatex(blockPreview, currentLatex, true)
    // Focus after next microtask so PM doesn't immediately steal focus back
    Promise.resolve().then(() => sourceEditor.focus()).catch(() => {})
  }

  function exitEditMode(): void {
    if (!isEditing) return
    isEditing = false
    editContainer.style.display = 'none'
    renderContainer.style.display = ''
    renderKatex(renderContainer, currentLatex, isBlock)
  }

  function dispatchLatexUpdate(latex: string): void {
    const pos = getPos()
    if (pos === undefined) return
    view.dispatch(view.state.tr.setNodeAttribute(pos, 'latex', latex))
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  // Click rendered output -> enter edit mode
  const handleRenderClick = (): void => {
    enterEditMode()
  }

  // Source editor: live update on every keystroke
  const handleInput = (): void => {
    const latex = sourceEditor.value
    currentLatex = latex
    if (blockPreview) renderKatex(blockPreview, latex, true)
    dispatchLatexUpdate(latex)
  }

  // Blur -> exit edit mode
  const handleBlur = (): void => {
    exitEditMode()
  }

  // Keyboard: Escape -> exit; Enter (inline only) -> exit
  const handleKeydown = (e: Event): void => {
    const ke = e as KeyboardEvent
    if (ke.key === 'Escape') {
      e.preventDefault()
      exitEditMode()
      view.focus()
    } else if (!isBlock && ke.key === 'Enter') {
      e.preventDefault()
      exitEditMode()
      view.focus()
    }
    // Stop propagation so ProseMirror doesn't handle these keys
    e.stopPropagation()
  }

  renderContainer.addEventListener('click', handleRenderClick)
  sourceEditor.addEventListener('input', handleInput)
  sourceEditor.addEventListener('blur', handleBlur)
  sourceEditor.addEventListener('keydown', handleKeydown)

  // Initial render
  renderKatex(renderContainer, currentLatex, isBlock)

  // ---------------------------------------------------------------------------
  // NodeView interface
  // ---------------------------------------------------------------------------

  return {
    dom,

    /**
     * Called when the node's attrs or content change.
     * Sync the rendered output when latex changes externally (e.g. undo/redo).
     * Returns false only if the node type changed (PM should rebuild the view).
     */
    update(updatedNode: Node): boolean {
      // Type guard: decline if the node type changed
      const expectedType = isBlock ? 'math_block' : 'math_inline'
      if (updatedNode.type.name !== expectedType) return false

      const newLatex = updatedNode.attrs['latex'] as string
      if (newLatex !== currentLatex) {
        currentLatex = newLatex
        if (!isEditing) {
          renderKatex(renderContainer, currentLatex, isBlock)
        } else {
          // Edit mode: update source editor value if changed externally
          sourceEditor.value = currentLatex
          if (blockPreview) renderKatex(blockPreview, currentLatex, true)
        }
      }
      return true
    },

    /**
     * Prevent PM from handling events inside our editor (input, keydown, etc.).
     * This keeps PM from interfering with typing in the source editor.
     */
    stopEvent(event: Event): boolean {
      // Let copy/paste propagate, but capture keyboard/input events
      if (event instanceof KeyboardEvent) return true
      if (event instanceof InputEvent) return true
      if (event.type === 'mousedown' && event.target !== dom) return true
      return false
    },

    /**
     * Ignore DOM mutations inside this NodeView: our innerHTML manipulation
     * (KaTeX render) would otherwise confuse PM's mutation observer.
     */
    ignoreMutation(): boolean {
      return true
    },

    /** Clean up all event listeners when PM tears down this view. */
    destroy(): void {
      renderContainer.removeEventListener('click', handleRenderClick)
      sourceEditor.removeEventListener('input', handleInput)
      sourceEditor.removeEventListener('blur', handleBlur)
      sourceEditor.removeEventListener('keydown', handleKeydown)
    },
  }
}

// ---------------------------------------------------------------------------
// Exported NodeViewConstructor factories
// ---------------------------------------------------------------------------

/**
 * NodeView constructor for `math_inline` nodes.
 * Used in EditorView's `nodeViews: { math_inline: mathInlineNodeView }`.
 */
export const mathInlineNodeView: NodeViewConstructor = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => makeMathNodeView(node, view, getPos, { isBlock: false })

/**
 * NodeView constructor for `math_block` nodes.
 * Used in EditorView's `nodeViews: { math_block: mathBlockNodeView }`.
 */
export const mathBlockNodeView: NodeViewConstructor = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => makeMathNodeView(node, view, getPos, { isBlock: true })
