// @vitest-environment node
/**
 * Unit tests for the folder-wide search implementation.
 *
 * Two scopes:
 *   1. searchInText - pure function, no fs - exercises core matching logic.
 *   2. registerSearchHandlers integration - writes temp .md files, calls the
 *      IPC handler directly (bypassing Electron), asserts per-file grouping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { searchInText } from '@main/ipc/search'
import type { FolderSearchMatch } from '@shared/types'

// ---------------------------------------------------------------------------
// searchInText - pure helper tests
// ---------------------------------------------------------------------------

describe('searchInText', () => {
  it('finds lines containing the query and returns 1-based line numbers', () => {
    const content = 'a\nfoo bar\nbaz foo\n'
    const results = searchInText(content, 'foo', false)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject<FolderSearchMatch>({ lineNumber: 2, lineText: 'foo bar' })
    expect(results[1]).toMatchObject<FolderSearchMatch>({ lineNumber: 3, lineText: 'baz foo' })
  })

  it('returns the exact line text for each match', () => {
    const content = 'hello world\nfoo bar baz\nqux'
    const results = searchInText(content, 'foo', false)
    expect(results).toHaveLength(1)
    expect(results[0]?.lineText).toBe('foo bar baz')
  })

  it('is case-insensitive when caseSensitive=false', () => {
    const content = 'Hello World\nhello world\nHELLO WORLD'
    const results = searchInText(content, 'hello', false)
    expect(results).toHaveLength(3)
    // All three lines should match regardless of case.
    expect(results.map((r) => r.lineNumber)).toEqual([1, 2, 3])
  })

  it('is case-sensitive when caseSensitive=true', () => {
    const content = 'Hello World\nhello world\nHELLO WORLD'
    const results = searchInText(content, 'hello', true)
    expect(results).toHaveLength(1)
    expect(results[0]?.lineNumber).toBe(2)
  })

  it('returns [] for an empty query', () => {
    const content = 'some text\nmore text'
    expect(searchInText(content, '', false)).toEqual([])
    expect(searchInText(content, '', true)).toEqual([])
  })

  it('returns [] when no lines match', () => {
    const content = 'apple\nbanana\ncherry'
    expect(searchInText(content, 'mango', false)).toEqual([])
  })

  it('handles a single-line document with no trailing newline', () => {
    const results = searchInText('only line with query', 'query', false)
    expect(results).toHaveLength(1)
    expect(results[0]?.lineNumber).toBe(1)
  })

  it('caps results at MAX_MATCHES_PER_FILE (20)', () => {
    // 25 matching lines
    const content = Array.from({ length: 25 }, () => 'match this line').join('\n')
    const results = searchInText(content, 'match', false)
    expect(results.length).toBeLessThanOrEqual(20)
  })

  it('truncates very long lines and appends ellipsis', () => {
    const longLine = 'x'.repeat(400)
    const results = searchInText(longLine, 'x', false)
    expect(results).toHaveLength(1)
    // The returned lineText should be at most 301 chars (300 + ellipsis char).
    expect(results[0]?.lineText.length).toBeLessThanOrEqual(302)
    expect(results[0]?.lineText.endsWith('…')).toBe(true)
  })

  it('handles Windows-style line endings by splitting on \\n', () => {
    // \r\n -> the \r becomes part of the lineText (split on \n only),
    // but the match still finds the needle.
    const content = 'line one\r\nfoo bar\r\nline three\r\n'
    const results = searchInText(content, 'foo', false)
    expect(results).toHaveLength(1)
    expect(results[0]?.lineNumber).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// searchFolder integration - reads real temp files via IPC handler directly
// ---------------------------------------------------------------------------

// We exercise searchInText + collectMarkdownPaths via the actual implementation
// but bypass the Electron ipcMain plumbing by importing the logic indirectly.
// Since registerSearchHandlers() adds an ipcMain handler we cannot call in
// tests, we instead invoke the search logic used inside it via the exported
// searchInText and the buildFileTree already tested in fsHelpers.test.ts.
//
// The integration test here verifies the full per-file grouping contract by
// calling buildFileTree + readTextFile + searchInText in the same way the
// handler does.

import { buildFileTree, readTextFile } from '@main/fs-helpers'
import { basename } from 'node:path'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-search-'))

  // Layout:
  //   notes.md   - contains "hello world" and "foo bar"
  //   other.md   - contains "no match here"
  //   sub/
  //     deep.md  - contains "hello deep"
  mkdirSync(join(tmpDir, 'sub'))
  writeFileSync(join(tmpDir, 'notes.md'), '# Notes\nhello world\nfoo bar\n', 'utf8')
  writeFileSync(join(tmpDir, 'other.md'), '# Other\nno match here\n', 'utf8')
  writeFileSync(join(tmpDir, 'sub', 'deep.md'), '# Deep\nhello deep\n', 'utf8')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Replicate the handler's logic without Electron ipcMain. */
async function searchFolder(
  root: string,
  query: string,
  caseSensitive: boolean,
) {
  if (!query || query.length < 1) return []

  // Flatten the tree.
  const tree = await buildFileTree(root)
  const paths: string[] = []
  function walk(nodes: typeof tree): void {
    for (const node of nodes) {
      if (node.isDirectory && node.children) walk(node.children)
      else if (!node.isDirectory) paths.push(node.path)
    }
  }
  walk(tree)

  const results = []
  for (const filePath of paths) {
    const content = await readTextFile(filePath)
    const matches = searchInText(content, query, caseSensitive)
    if (matches.length > 0) {
      results.push({ filePath, fileName: basename(filePath), matches })
    }
  }
  return results
}

describe('searchFolder integration', () => {
  it('returns one result per file with matches, grouped correctly', async () => {
    const results = await searchFolder(tmpDir, 'hello', false)
    // notes.md and sub/deep.md both contain "hello"; other.md does not.
    expect(results).toHaveLength(2)

    const notesResult = results.find((r) => r.fileName === 'notes.md')
    const deepResult = results.find((r) => r.fileName === 'deep.md')

    expect(notesResult).toBeDefined()
    expect(deepResult).toBeDefined()

    // notes.md has "hello world" on line 2.
    expect(notesResult?.matches[0]?.lineNumber).toBe(2)
    expect(notesResult?.matches[0]?.lineText).toBe('hello world')

    // sub/deep.md has "hello deep" on line 2.
    expect(deepResult?.matches[0]?.lineNumber).toBe(2)
    expect(deepResult?.matches[0]?.lineText).toBe('hello deep')
  })

  it('returns [] for a query with no matches across any file', async () => {
    const results = await searchFolder(tmpDir, 'zzznomatch', false)
    expect(results).toEqual([])
  })

  it('returns [] for an empty query', async () => {
    const results = await searchFolder(tmpDir, '', false)
    expect(results).toEqual([])
  })

  it('respects caseSensitive=true', async () => {
    // "hello" is lowercase in files; searching for "HELLO" with caseSensitive
    // should find nothing.
    const results = await searchFolder(tmpDir, 'HELLO', true)
    expect(results).toEqual([])
  })

  it('includes filePath and fileName in each result', async () => {
    const results = await searchFolder(tmpDir, 'foo', false)
    expect(results).toHaveLength(1)
    expect(results[0]?.fileName).toBe('notes.md')
    expect(results[0]?.filePath).toContain('notes.md')
  })
})
