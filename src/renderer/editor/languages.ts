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

import { getLowlight, whenLanguagesReady } from './plugins/highlight'

// ---------------------------------------------------------------------------
// Shared lowlight instance
//
// We route through the ONE lazily-loaded lowlight instance owned by
// highlight.ts (getLowlight / whenLanguagesReady) instead of creating a second
// createLowlight(common) here. That keeps the heavy `common` grammar set out of
// the eager startup bundle: it is dynamic-imported on first need and shared by
// both the highlighter and this language-selector registry.
// ---------------------------------------------------------------------------

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

/** Sort + dedupe a language list (alphabetical, locale-aware). */
function sortUnique(langs: Iterable<string>): string[] {
  return Array.from(new Set(langs)).sort((a, b) => a.localeCompare(b))
}

/**
 * Return a sorted, deduplicated array of all available code-block languages.
 *
 * Includes every language in COMMON_LANGUAGES plus every language registered in
 * the shared lowlight instance. 'mermaid' and 'plaintext' are always present
 * because they are in COMMON_LANGUAGES (lowlight does not register them).
 *
 * Because the lowlight grammars are now lazy-loaded, this is computed in two
 * phases:
 *   - Before the grammars load, it returns just the curated COMMON_LANGUAGES
 *     (sorted/deduped). The curated list already contains the popular languages,
 *     so the selector is immediately usable.
 *   - On first call it kicks off the lazy load; once the grammars resolve the
 *     cache is invalidated so the next call returns the full merged list (the
 *     code_block NodeView rebuilds its <select> from availableLanguages()).
 *   - Once the grammars are present, the full merged list is cached and stable
 *     (the lowlight grammar list does not change at runtime).
 */
export function availableLanguages(): string[] {
  if (_cached !== null) return _cached

  const lowlight = getLowlight()
  if (!lowlight) {
    // Grammars not loaded yet: trigger the lazy load and, once it resolves,
    // drop the (curated-only) cache so subsequent calls return the full list.
    // We intentionally do NOT cache here so the post-load call recomputes.
    void whenLanguagesReady().then(() => {
      _cached = null
    })
    return sortUnique(COMMON_LANGUAGES)
  }

  _cached = sortUnique([...COMMON_LANGUAGES, ...lowlight.listLanguages()])
  return _cached
}
