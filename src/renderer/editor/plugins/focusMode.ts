/**
 * focusMode.ts - ProseMirror plugin for Focus Mode.
 *
 * Focus mode dims all top-level blocks except the one containing the cursor.
 *
 * APPROACH:
 *   - This plugin is always active (never reconfigured on toggle).
 *   - It adds a NODE decoration with class `block-focused` to exactly the
 *     top-level block (direct child of doc) that contains the selection head.
 *   - The CSS in github.css gates the dimming: blocks are only dimmed when the
 *     editor container has the class `focus-mode`. Without that class, all
 *     blocks render at full opacity regardless of the `block-focused` deco.
 *   - This means toggling focus mode only requires adding/removing a CSS class
 *     on the container - no plugin reconfiguration, no transaction dispatch.
 *
 * DECORATION:
 *   Node decoration: wraps the top-level node so `.ProseMirror > .block-focused`
 *   can be targeted in CSS. The `class` attribute is set on the wrapper element
 *   by ProseMirror via NodeDecoration attrs.
 */

import { type Plugin, PluginKey } from 'prosemirror-state'
import { type DecorationSet } from 'prosemirror-view'
import { activeBlockDecorationPlugin } from './topLevelBlock'

// Exported key so tests can look up the plugin by key name.
export const focusModeKey = new PluginKey<DecorationSet>('focusMode')

/**
 * Return a ProseMirror Plugin that decorates the focused top-level block (the
 * direct child of the doc containing the selection head) with a node decoration
 * carrying `class: 'block-focused'`. CSS gates the dimming behind the
 * `.focus-mode` container class. The decoration is stateful + mapped (see
 * activeBlockDecorationPlugin) so it stays cheap to recompute per keystroke in
 * large documents.
 */
export function focusModePlugin(): Plugin<DecorationSet> {
  return activeBlockDecorationPlugin(focusModeKey, 'block-focused')
}
