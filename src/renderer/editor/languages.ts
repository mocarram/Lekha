/**
 * languages.ts
 *
 * Language registry for the code block language selector.
 *
 * Provides:
 *   - COMMON_LANGUAGES: curated list of languages shown first / always visible.
 *   - availableLanguages(): deduplicated, sorted union of the curated list and
 *     every language registered in the shared lowlight instance.
 *
 * This module is pure (no DOM, no side effects) so it is straightforward to
 * unit-test and importable from both the NodeView and test files.
 */

import { createLowlight, common } from 'lowlight'

// ---------------------------------------------------------------------------
// Shared lowlight instance (same grammars as highlight.ts uses)
// ---------------------------------------------------------------------------

const lowlight = createLowlight(common)

// ---------------------------------------------------------------------------
// Curated common language list
//
// Ordered loosely by popularity so the native <select> option order feels
// natural when searching. 'plaintext' maps to an empty language attr in PM
// (no highlighting); 'mermaid' is added explicitly because lowlight does not
// know about it.
// ---------------------------------------------------------------------------

export const COMMON_LANGUAGES: string[] = [
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'python',
  'java',
  'c',
  'cpp',
  'csharp',
  'go',
  'rust',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'bash',
  'shell',
  'json',
  'yaml',
  'toml',
  'html',
  'css',
  'scss',
  'sql',
  'markdown',
  'diff',
  'dockerfile',
  'graphql',
  'mermaid',
  'plaintext',
]

// ---------------------------------------------------------------------------
// availableLanguages
//
// Union of COMMON_LANGUAGES and the languages lowlight knows about, deduplicated
// and sorted alphabetically. The result is stable across calls (the lowlight
// grammar list does not change at runtime) so callers can call this once and
// cache the result.
// ---------------------------------------------------------------------------

let _cached: string[] | null = null

/**
 * Return a sorted, deduplicated array of all available code-block languages.
 *
 * Includes every language in COMMON_LANGUAGES plus every language registered
 * in the shared lowlight instance. 'mermaid' and 'plaintext' are always present
 * because they are in COMMON_LANGUAGES (lowlight does not register them).
 */
export function availableLanguages(): string[] {
  if (_cached !== null) return _cached

  const registered = lowlight.listLanguages()
  const merged = new Set([...COMMON_LANGUAGES, ...registered])
  _cached = Array.from(merged).sort((a, b) => a.localeCompare(b))
  return _cached
}
