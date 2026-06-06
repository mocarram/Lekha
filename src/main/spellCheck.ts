/**
 * spellCheck.ts - Spell-checker session configuration helper.
 *
 * Electron's native spell-checker is controlled per-session via
 * `session.setSpellCheckerLanguages`. This module provides a pure, unit-testable
 * helper that applies the current spell-check settings to any Session-like object,
 * plus the IPC channel constant for triggering a re-apply from the renderer.
 *
 * When spellCheck is off we pass an empty array, which disables the red underlines
 * entirely. When on we pass a single-element array with the chosen BCP-47 tag.
 *
 * The actual wiring (importing `session` from electron and calling this helper in
 * the right places) lives in index.ts, keeping this module Electron-free and
 * therefore unit-testable without the Electron runtime.
 */

/** The subset of an Electron Session object that this helper needs. */
export interface SpellCheckSession {
  setSpellCheckerLanguages(languages: string[]): void
}

/** Arguments for applying spell-check settings. */
export interface SpellCheckConfig {
  spellCheck: boolean
  language: string
}

/**
 * Apply spell-check settings to `session`.
 *
 * - When `spellCheck` is false: passes `[]` to disable the native underlines.
 * - When `spellCheck` is true: passes `[language]` to enable checking in that
 *   language.
 */
export function applySpellCheck(
  session: SpellCheckSession,
  config: SpellCheckConfig,
): void {
  session.setSpellCheckerLanguages(config.spellCheck ? [config.language] : [])
}
