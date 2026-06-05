/**
 * codeBlockNodeView.ts
 *
 * ProseMirror NodeView for `code_block` nodes.
 *
 * Design goals:
 *   - Always expose an editable `contentDOM` (`<code>` inside `<pre>`).
 *     ProseMirror manages all text content through this element, so cursor
 *     placement, selection, and the existing highlightPlugin decorations all
 *     work without any extra effort.
 *   - For diagram languages (currently `mermaid`), render a `.diagram-preview`
 *     element BELOW the source. The preview is updated asynchronously,
 *     debounced to 250 ms, so fast typing does not flood the renderer.
 *   - `ignoreMutation`: mermaid writes SVG into the preview div; those mutations
 *     must be ignored so ProseMirror does not try to reconcile them. Mutations
 *     inside `contentDOM` must NOT be ignored - ProseMirror needs them to track
 *     user edits.
 *   - `update(node)`: return true (keep contentDOM) whenever the node type is
 *     still `code_block`. Sync language class and schedule a re-render only if
 *     the code or language actually changed.
 *   - `stopEvent`: do not swallow events inside `contentDOM`; let ProseMirror
 *     handle them normally. Only stop events that originate in the preview.
 *   - `destroy`: clear the debounce timer and release the preview element ref.
 *
 * Phase 2 note (not implemented): WYSIWYG hides the source on blur and shows
 * only the rendered diagram. That "hide-source-on-blur" toggle is intentionally
 * omitted here to keep editing robust. Follow-up task.
 */

import { type Node } from 'prosemirror-model'
import {
  type EditorView,
  type NodeView,
  type NodeViewConstructor,
  type ViewMutationRecord,
} from 'prosemirror-view'
import { renderMermaid } from './mermaid'

// ---------------------------------------------------------------------------
// Diagram language registry
// ---------------------------------------------------------------------------

/**
 * Set of fenced-code languages that should show a live diagram preview.
 * Extend this set to add future diagram types (e.g. 'plantuml', 'graphviz').
 */
export const DIAGRAM_LANGS = new Set(['mermaid'])

// ---------------------------------------------------------------------------
// Placeholder text shown while the preview is empty or before first render
// ---------------------------------------------------------------------------

const PLACEHOLDER_HTML =
  '<span class="diagram-placeholder">Rendering diagram...</span>'

// ---------------------------------------------------------------------------
// NodeView factory
// ---------------------------------------------------------------------------

function makeCodeBlockNodeView(
  node: Node,
  _view: EditorView,
  _getPos: () => number | undefined,
): NodeView {
  // ---- Outer wrapper -------------------------------------------------------
  // <div class="code-block-wrapper"> holds both the source pre and the preview.
  // Using a <div> (not <pre>) at the outer level lets us stack source + preview
  // vertically without affecting the <pre>'s whitespace handling.
  const dom = document.createElement('div')
  dom.className = 'code-block-wrapper'

  // ---- Editable source (<pre><code>) ---------------------------------------
  // contentDOM = <code>: ProseMirror renders the block's text content here.
  // Inline decorations from highlightPlugin target positions inside this element
  // and work normally because PM owns the DOM subtree of contentDOM.
  const pre = document.createElement('pre')
  pre.className = 'code-block'
  const contentDOM = document.createElement('code')
  pre.appendChild(contentDOM)
  dom.appendChild(pre)

  // ---- Preview element (diagram languages only) ----------------------------
  // Created unconditionally but only appended to the DOM when the language is
  // in DIAGRAM_LANGS. This keeps the update() path simple: we always have the
  // reference, but only render when needed.
  const previewEl = document.createElement('div')
  previewEl.className = 'diagram-preview'

  // Track current state so update() can skip no-op re-renders.
  let currentLanguage = node.attrs['language'] as string
  let currentCode = node.textContent

  // Debounce timer handle
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // ---- Helper: is current language a diagram language? ---------------------
  function isDiagram(lang: string): boolean {
    return DIAGRAM_LANGS.has(lang)
  }

  // ---- Attach / detach preview based on language --------------------------
  function attachPreviewIfNeeded(): void {
    if (isDiagram(currentLanguage) && !dom.contains(previewEl)) {
      previewEl.innerHTML = PLACEHOLDER_HTML
      dom.appendChild(previewEl)
    } else if (!isDiagram(currentLanguage) && dom.contains(previewEl)) {
      dom.removeChild(previewEl)
    }
  }

  // ---- Schedule a debounced diagram render --------------------------------
  function scheduleRender(): void {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void runRender()
    }, 250)
  }

  // ---- Perform the async render -------------------------------------------
  async function runRender(): Promise<void> {
    const code = currentCode.trim()
    const lang = currentLanguage

    // Empty source: show placeholder
    if (!code) {
      previewEl.innerHTML = '<span class="diagram-placeholder">Nothing to render.</span>'
      return
    }

    // Derive a stable-ish id from the language name (unique counter added inside renderMermaid)
    const result = await renderMermaid(lang, code)

    if ('svg' in result) {
      previewEl.innerHTML = result.svg
    } else {
      previewEl.innerHTML = `<div class="diagram-error">${escapeHtml(result.error)}</div>`
    }
  }

  // ---- Simple HTML escaper for error messages ----------------------------
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // ---- Initial setup -------------------------------------------------------
  attachPreviewIfNeeded()
  if (isDiagram(currentLanguage)) {
    scheduleRender()
  }

  // ---- Set language class on <pre> for CSS targeting ----------------------
  function syncLanguageClass(lang: string): void {
    // Remove any previous language class
    pre.className = lang ? `code-block language-${lang}` : 'code-block'
  }
  syncLanguageClass(currentLanguage)

  // -------------------------------------------------------------------------
  // NodeView interface
  // -------------------------------------------------------------------------

  return {
    dom,
    contentDOM,

    /**
     * Called by ProseMirror when the node's attrs or content change.
     *
     * - If node type changed: return false (PM will destroy and re-create).
     * - Otherwise: sync language class, update preview if code or lang changed,
     *   return true to keep contentDOM intact (critical for editing continuity).
     */
    update(updatedNode: Node): boolean {
      if (updatedNode.type.name !== 'code_block') return false

      const newLang = updatedNode.attrs['language'] as string
      const newCode = updatedNode.textContent
      const langChanged = newLang !== currentLanguage
      const codeChanged = newCode !== currentCode

      currentLanguage = newLang
      currentCode = newCode

      if (langChanged) {
        syncLanguageClass(newLang)
        attachPreviewIfNeeded()
      }

      // Re-render if anything diagram-relevant changed
      if (isDiagram(currentLanguage) && (langChanged || codeChanged)) {
        scheduleRender()
      }

      return true
    },

    /**
     * Decide whether to ignore a DOM mutation.
     *
     * - Mutations inside `previewEl`: IGNORE. Mermaid writes SVG into it;
     *   letting PM see those would cause it to try to reconcile unknown DOM.
     * - Mutations inside `contentDOM`: do NOT ignore. PM must observe them to
     *   track text edits (selection, composition, etc.).
     * - Anything else: let PM decide (return false).
     *
     * The check `previewEl.contains(m.target)` is O(depth) and precise.
     */
    ignoreMutation(m: ViewMutationRecord): boolean {
      // Ignore all mutations that originate inside the preview subtree.
      // ViewMutationRecord.target is DOMNode (InstanceType<typeof window.Node>),
      // which is the DOM Node interface - compatible with HTMLElement.contains().
      return previewEl.contains(m.target)
    },

    /**
     * Stop events that originate inside the preview from reaching ProseMirror.
     * Events inside contentDOM must flow through normally so PM handles
     * typing, arrow keys, selection, etc.
     */
    stopEvent(event: Event): boolean {
      const target = event.target as globalThis.Node | null
      if (target && previewEl.contains(target)) return true
      return false
    },

    /** Clean up the debounce timer when PM tears down this view. */
    destroy(): void {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
    },
  }
}

// ---------------------------------------------------------------------------
// Exported NodeViewConstructor
// ---------------------------------------------------------------------------

/**
 * NodeView constructor for `code_block` nodes.
 * Register in EditorView's `nodeViews: { code_block: codeBlockNodeView }`.
 */
export const codeBlockNodeView: NodeViewConstructor = (
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView => makeCodeBlockNodeView(node, view, getPos)
