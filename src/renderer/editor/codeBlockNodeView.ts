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
 *   - Header bar (top-right of each block): non-editable control strip with a
 *     language <select> and a copy-to-clipboard button. The header is positioned
 *     outside contentDOM so it never interferes with ProseMirror's text handling.
 *   - `ignoreMutation`: mermaid writes SVG into the preview div and the header
 *     controls update their own DOM (e.g. "Copied" feedback); those mutations
 *     must be ignored so ProseMirror does not try to reconcile them. Mutations
 *     inside `contentDOM` must NOT be ignored - ProseMirror needs them to track
 *     user edits.
 *   - `update(node)`: return true (keep contentDOM) whenever the node type is
 *     still `code_block`. Sync language class/selector and schedule a re-render
 *     only if the code or language actually changed.
 *   - `stopEvent`: do not swallow events inside `contentDOM`; let ProseMirror
 *     handle them normally. Stop events that originate in the preview or header
 *     so PM does not hijack select/button interactions.
 *   - `destroy`: clear the debounce timer, copy timer, and release event listeners.
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
import { renderMermaid, MERMAID_RERENDER_EVENT } from './mermaid'
import { availableLanguages } from './languages'

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
// Sentinel value: 'plaintext' in the selector maps to '' in the PM attr
// ---------------------------------------------------------------------------

const PLAINTEXT_VALUE = 'plaintext'

// ---------------------------------------------------------------------------
// NodeView factory
// ---------------------------------------------------------------------------

function makeCodeBlockNodeView(
  node: Node,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  // ---- Outer wrapper -------------------------------------------------------
  // <div class="code-block-wrapper"> holds the header, the source pre, and the
  // optional diagram preview. Using a <div> (not <pre>) at the outer level lets
  // us stack source + preview vertically without affecting the <pre>'s
  // whitespace handling.
  //
  // Diagram blocks additionally get the `is-diagram` class so CSS can hide the
  // source by default and only reveal it when the block is the active block
  // (the activeBlockPlugin adds `is-active-block` to this same wrapper element,
  // since a code_block is a top-level block). See github.css section 15.
  const dom = document.createElement('div')
  dom.className = 'code-block-wrapper'

  // ---- Header bar ----------------------------------------------------------
  // Non-editable strip at the top of each code block. Contains the language
  // selector and the copy button. Sits OUTSIDE contentDOM so ProseMirror never
  // manages any text content inside it.
  const headerEl = document.createElement('div')
  headerEl.className = 'code-block-header'
  // Prevent the browser from treating the header as part of the editable region.
  headerEl.contentEditable = 'false'
  dom.appendChild(headerEl)

  // ---- Language selector ---------------------------------------------------
  // Native <select> populated with availableLanguages(). Selecting a language
  // dispatches a setNodeMarkup transaction to update the PM node's `language`
  // attr, which triggers re-highlighting (and diagram preview if mermaid).
  //
  // 'plaintext' is the visual label for an empty language attr (no highlighting).
  const langSelect = document.createElement('select')
  langSelect.className = 'lang-selector'

  // Populate options from the deduplicated, sorted language list.
  const langs = availableLanguages()
  for (const lang of langs) {
    const opt = document.createElement('option')
    opt.value = lang
    opt.textContent = lang
    langSelect.appendChild(opt)
  }

  // On change, dispatch a setNodeMarkup to update the language attr.
  // 'plaintext' maps to '' so the highlighter sees an empty/unrecognised lang.
  langSelect.addEventListener('change', () => {
    const pos = getPos()
    if (pos === undefined) return
    const selectedLang = langSelect.value === PLAINTEXT_VALUE ? '' : langSelect.value
    view.dispatch(
      view.state.tr.setNodeMarkup(pos, undefined, {
        ...view.state.doc.nodeAt(pos)?.attrs,
        language: selectedLang,
      }),
    )
  })

  headerEl.appendChild(langSelect)

  // ---- Copy button ---------------------------------------------------------
  // Copies the code block's text content to the clipboard via the preload API.
  // Shows a transient "Copied!" state for 1.5 s, then reverts to "Copy".
  const copyBtn = document.createElement('button')
  copyBtn.className = 'copy-btn'
  copyBtn.type = 'button'
  copyBtn.textContent = 'Copy'

  let copyResetTimer: ReturnType<typeof setTimeout> | null = null

  copyBtn.addEventListener('click', () => {
    // currentCode is kept up-to-date by update(); use it rather than node.textContent
    // so copy always reflects the latest source even after edits.
    void (window as Window & { lekha?: { writeClipboard: (args: { text: string }) => Promise<void> } })
      .lekha?.writeClipboard({ text: currentCode })

    copyBtn.textContent = 'Copied!'
    copyBtn.classList.add('copied')

    if (copyResetTimer !== null) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => {
      copyBtn.textContent = 'Copy'
      copyBtn.classList.remove('copied')
      copyResetTimer = null
    }, 1500)
  })

  headerEl.appendChild(copyBtn)

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

  // ---- Toggle the `is-diagram` wrapper class for CSS targeting ------------
  // Uses classList so it composes with the `is-active-block` class that the
  // activeBlockPlugin adds to this same element via a node decoration.
  function syncDiagramClass(lang: string): void {
    dom.classList.toggle('is-diagram', isDiagram(lang))
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

  // ---- Sync the selector value to the given language attr ----------------
  // 'plaintext' is shown when the lang attr is '' (no language set).
  function syncSelector(lang: string): void {
    const displayValue = lang === '' ? PLAINTEXT_VALUE : lang
    // Only set if the option exists - avoids resetting to the first option for
    // languages not in the list (e.g. an alias like 'js').
    const hasOption = Array.from(langSelect.options).some((o) => o.value === displayValue)
    if (hasOption) {
      langSelect.value = displayValue
    } else {
      // Language not in list (e.g. an alias). Fall back to showing the raw value.
      // We add a temporary option so the select reflects reality.
      const tempOpt = document.createElement('option')
      tempOpt.value = lang
      tempOpt.textContent = lang
      langSelect.appendChild(tempOpt)
      langSelect.value = lang
    }
  }

  // ---- Re-render on app theme change --------------------------------------
  // When the app theme changes, mermaid re-initializes and broadcasts this
  // event. Diagram blocks re-render immediately so their colours match the new
  // theme (live dark-mode sync). Non-diagram blocks ignore it.
  function onThemeRerender(): void {
    if (isDiagram(currentLanguage)) {
      void runRender()
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener(MERMAID_RERENDER_EVENT, onThemeRerender)
  }

  // ---- Initial setup -------------------------------------------------------
  syncDiagramClass(currentLanguage)
  syncSelector(currentLanguage)
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
        syncDiagramClass(newLang)
        syncSelector(newLang)
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
     * - Mutations inside `headerEl`: IGNORE. The language selector and copy
     *   button update their own DOM (option selection highlight, "Copied!" text);
     *   those must not be reconciled by ProseMirror.
     * - Mutations inside `previewEl`: IGNORE. Mermaid writes SVG into it;
     *   letting PM see those would cause it to try to reconcile unknown DOM.
     * - Mutations inside `contentDOM`: do NOT ignore. PM must observe them to
     *   track text edits (selection, composition, etc.).
     * - Anything else: let PM decide (return false).
     *
     * The check `el.contains(m.target)` is O(depth) and precise.
     */
    ignoreMutation(m: ViewMutationRecord): boolean {
      // Ignore mutations that originate inside the header or the preview subtree.
      // ViewMutationRecord.target is DOMNode compatible with HTMLElement.contains().
      return headerEl.contains(m.target) || previewEl.contains(m.target)
    },

    /**
     * Stop events that originate inside the header or the preview from reaching
     * ProseMirror. Events inside contentDOM must flow through normally so PM
     * handles typing, arrow keys, selection, etc.
     *
     * Stopping header events is critical: without this, PM would intercept
     * mouse-down on the <select> and the copy button and move the cursor,
     * swallowing the user interaction.
     */
    stopEvent(event: Event): boolean {
      const target = event.target as globalThis.Node | null
      if (target === null) return false
      // Allow header and preview events to be handled by the native controls;
      // block ProseMirror from processing them as editor events.
      if (headerEl.contains(target)) return true
      if (previewEl.contains(target)) return true
      return false
    },

    /** Clean up the debounce timer, copy timer, and theme listener when PM tears down this view. */
    destroy(): void {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      if (copyResetTimer !== null) {
        clearTimeout(copyResetTimer)
        copyResetTimer = null
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener(MERMAID_RERENDER_EVENT, onThemeRerender)
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
