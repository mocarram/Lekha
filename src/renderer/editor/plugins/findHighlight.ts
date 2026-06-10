/**
 * ProseMirror plugin that highlights find/replace matches as decorations.
 *
 * State shape:
 *   { query, caseSensitive, wholeWord, matches, current, decorations }
 *
 * - `query` and `caseSensitive` are updated by dispatching a transaction with
 *   the FIND_QUERY_META key set.
 * - `matches` is recomputed from `findMatches` whenever the query changes OR
 *   the document changes.
 * - `current` is the index of the "active" match (-1 when no matches).
 * - Decorations: every match gets class `find-match`; the current one also
 *   gets `find-match--current`. The DecorationSet lives IN the plugin state
 *   and is only rebuilt when matches/current actually change - selection-only
 *   transactions reuse it, so cursor moves never pay an O(matches) rebuild
 *   (same pattern as topLevelBlock.ts).
 */

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import type { EditorView } from 'prosemirror-view'
import { findMatches } from '../find'
import type { FindMatch, FindOptions } from '../find'

// ---------------------------------------------------------------------------
// Plugin key and meta interface
// ---------------------------------------------------------------------------

export const findHighlightKey = new PluginKey<FindHighlightState>('findHighlight')

interface SetQueryMeta {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
}

interface SetCurrentMeta {
  current: number
}

// ---------------------------------------------------------------------------
// Plugin state shape
// ---------------------------------------------------------------------------

export interface FindHighlightState {
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  matches: FindMatch[]
  current: number
  decorations: DecorationSet
}

const INITIAL_STATE: FindHighlightState = {
  query: '',
  caseSensitive: false,
  wholeWord: false,
  matches: [],
  current: -1,
  decorations: DecorationSet.empty,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDecorations(
  doc: Parameters<typeof DecorationSet.create>[0],
  matches: FindMatch[],
  current: number,
): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty

  const decos = matches.map((m, i) => {
    const classes =
      i === current ? 'find-match find-match--current' : 'find-match'
    return Decoration.inline(m.from, m.to, { class: classes })
  })

  return DecorationSet.create(doc, decos)
}

// ---------------------------------------------------------------------------
// Plugin factory
// ---------------------------------------------------------------------------

export function findHighlightPlugin(): Plugin<FindHighlightState> {
  return new Plugin<FindHighlightState>({
    key: findHighlightKey,

    state: {
      init(_config, _state): FindHighlightState {
        return { ...INITIAL_STATE }
      },

      apply(tr, pluginState, _oldState, newState): FindHighlightState {
        const queryMeta = tr.getMeta(findHighlightKey) as
          | SetQueryMeta
          | SetCurrentMeta
          | null
          | undefined

        // Handle a query update
        if (queryMeta && 'query' in queryMeta) {
          const { query, caseSensitive, wholeWord } = queryMeta
          const matches = findMatches(newState.doc, query, { caseSensitive, wholeWord })
          const current = matches.length > 0 ? 0 : -1
          return {
            query,
            caseSensitive,
            wholeWord,
            matches,
            current,
            decorations: buildDecorations(newState.doc, matches, current),
          }
        }

        // Handle a current-index update (changes which match gets the
        // `--current` class, so the set is rebuilt; this only happens on
        // explicit next/prev/goto, never per keystroke).
        if (queryMeta && 'current' in queryMeta) {
          return {
            ...pluginState,
            current: queryMeta.current,
            decorations: buildDecorations(newState.doc, pluginState.matches, queryMeta.current),
          }
        }

        // If no meta: if the doc changed and we have an active query, recompute.
        if (tr.docChanged && pluginState.query) {
          const matches = findMatches(newState.doc, pluginState.query, {
            caseSensitive: pluginState.caseSensitive,
            wholeWord: pluginState.wholeWord,
          })
          // Try to keep the same "current" index, clamping if matches shrunk.
          const current =
            matches.length === 0
              ? -1
              : Math.min(pluginState.current < 0 ? 0 : pluginState.current, matches.length - 1)
          return {
            ...pluginState,
            matches,
            current,
            decorations: buildDecorations(newState.doc, matches, current),
          }
        }

        // Selection-only transaction (or doc change with no active query):
        // nothing to recompute, reuse the state - and its DecorationSet - as-is.
        return pluginState
      },
    },

    props: {
      decorations(state) {
        return findHighlightKey.getState(state)?.decorations ?? DecorationSet.empty
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Helper functions operating on a live EditorView
// ---------------------------------------------------------------------------

/**
 * Set the active search query. Dispatches a transaction with the query meta,
 * triggering state update and decoration recompute.
 * Returns the number of matches found.
 *
 * `jumpToFirst` (default true) scrolls the FIRST match into view (a query
 * update always resets `current` to 0) - the right behavior for Cmd+F and
 * clicking a result. Pass false to only refresh the highlights in place (used
 * to keep an open file's highlights in sync with the sidebar search query
 * without yanking the user's scroll position).
 */
export function setFindQuery(
  view: EditorView,
  query: string,
  opts: FindOptions,
  jumpToFirst = true,
): number {
  const meta: SetQueryMeta = {
    query,
    caseSensitive: opts.caseSensitive,
    wholeWord: opts.wholeWord ?? false,
  }
  const tr = view.state.tr.setMeta(findHighlightKey, meta)
  view.dispatch(tr)
  const pluginState = findHighlightKey.getState(view.state)
  const count = pluginState?.matches.length ?? 0
  // Scroll the current match into view as soon as a query is set (jump
  // to the first/nearest match while you type), without changing which match is
  // current. Skip when there are no matches or when refreshing in place.
  if (jumpToFirst && pluginState && count > 0) {
    const idx = pluginState.current >= 0 ? pluginState.current : 0
    _jumpToMatch(view, idx)
  }
  return count
}

/**
 * Advance to the next match, wrapping around, and scroll it into view.
 */
export function findNext(view: EditorView): void {
  const pluginState = findHighlightKey.getState(view.state)
  if (!pluginState || pluginState.matches.length === 0) return

  const next = (pluginState.current + 1) % pluginState.matches.length
  _jumpToMatch(view, next)
}

/**
 * Go to the previous match, wrapping around, and scroll it into view.
 */
export function findPrev(view: EditorView): void {
  const pluginState = findHighlightKey.getState(view.state)
  if (!pluginState || pluginState.matches.length === 0) return

  const prev =
    (pluginState.current - 1 + pluginState.matches.length) %
    pluginState.matches.length
  _jumpToMatch(view, prev)
}

/**
 * Replace the current match with `replacement`, recompute matches, advance
 * to the next match.
 */
export function replaceCurrent(view: EditorView, replacement: string): void {
  const pluginState = findHighlightKey.getState(view.state)
  if (!pluginState || pluginState.current < 0 || pluginState.matches.length === 0) return

  const match = pluginState.matches[pluginState.current]
  if (!match) return

  // Replace the text at the current match position.
  const tr = view.state.tr.insertText(replacement, match.from, match.to)
  view.dispatch(tr)

  // After doc change, plugin state auto-recomputes matches. Jump to next.
  findNext(view)
}

/**
 * Clear the active query and all highlights.
 */
export function clearFind(view: EditorView): void {
  const meta: SetQueryMeta = { query: '', caseSensitive: false, wholeWord: false }
  const tr = view.state.tr.setMeta(findHighlightKey, meta)
  view.dispatch(tr)
}

/**
 * Jump to a specific match by index (clamped into range), scrolling it into
 * view and marking it current. Used by the folder-search "open result" flow to
 * land on the clicked line's occurrence rather than always the first match.
 * No-op when there are no matches.
 */
export function gotoMatch(view: EditorView, index: number): void {
  const pluginState = findHighlightKey.getState(view.state)
  if (!pluginState || pluginState.matches.length === 0) return
  const clamped = Math.max(0, Math.min(index, pluginState.matches.length - 1))
  _jumpToMatch(view, clamped)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _jumpToMatch(view: EditorView, index: number): void {
  const pluginState = findHighlightKey.getState(view.state)
  if (!pluginState) return

  const match = pluginState.matches[index]
  if (!match) return

  // First dispatch the current-index update to update decorations.
  const metaTr = view.state.tr.setMeta(findHighlightKey, {
    current: index,
  } satisfies SetCurrentMeta)
  view.dispatch(metaTr)

  // Then move the selection to the match and scroll it into view.
  const { doc } = view.state
  const safeFrom = Math.min(match.from, doc.content.size)
  const safeTo = Math.min(match.to, doc.content.size)
  const sel = TextSelection.create(doc, safeFrom, safeTo)
  const selTr = view.state.tr.setSelection(sel).scrollIntoView()
  view.dispatch(selTr)
}
