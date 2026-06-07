// @vitest-environment node
/**
 * Unit tests for markdownPathsFromArgv (src/main/openWith.ts), the pure,
 * Electron-free helper that turns a process argv array into the set of openable
 * files Lekha should open at launch on Windows/Linux. The macOS `open-file`
 * route and the IPC wiring are Electron-bound and covered elsewhere.
 *
 * `exists` and `resolve` are injected so the parser is deterministic without
 * touching the real filesystem.
 */
import { describe, it, expect } from 'vitest'
import { markdownPathsFromArgv, OPENABLE_EXT_RE } from '../../../src/main/openWith'

// A POSIX-ish resolver good enough for assertions: absolute paths pass through,
// relative ones are joined to cwd.
const resolve = (cwd: string, p: string): string => (p.startsWith('/') ? p : `${cwd}/${p}`)

/** Build options with an explicit allow-list of existing absolute paths. */
function opts(existing: string[], cwd = '/work') {
  const set = new Set(existing)
  return { cwd, resolve, exists: (p: string) => set.has(p) }
}

describe('OPENABLE_EXT_RE', () => {
  it('matches markdown and text extensions, case-insensitively', () => {
    for (const f of ['a.md', 'a.MARKDOWN', 'a.mdx', 'a.txt', 'a.TEXT']) {
      expect(OPENABLE_EXT_RE.test(f)).toBe(true)
    }
  })
  it('rejects non-openable extensions', () => {
    for (const f of ['a.pdf', 'a.png', 'a.docx', 'a', 'a.md.zip']) {
      expect(OPENABLE_EXT_RE.test(f)).toBe(false)
    }
  })
})

describe('markdownPathsFromArgv', () => {
  it('returns an existing markdown file passed as an absolute path', () => {
    const argv = ['/usr/bin/lekha', '/docs/notes.md']
    expect(markdownPathsFromArgv(argv, opts(['/docs/notes.md']))).toEqual(['/docs/notes.md'])
  })

  it('resolves a relative path against cwd', () => {
    const argv = ['lekha', 'notes.md']
    expect(markdownPathsFromArgv(argv, opts(['/work/notes.md']))).toEqual(['/work/notes.md'])
  })

  it('skips the leading executable argument', () => {
    // argv[0] happens to look openable + "exists" - it must still be skipped.
    const argv = ['/apps/editor.md', '/docs/real.md']
    expect(
      markdownPathsFromArgv(argv, opts(['/apps/editor.md', '/docs/real.md'])),
    ).toEqual(['/docs/real.md'])
  })

  it('ignores switches (--flag, -x, --foo=bar)', () => {
    const argv = ['lekha', '--inspect', '-v', '--enable-x=1', '/docs/a.md']
    expect(markdownPathsFromArgv(argv, opts(['/docs/a.md']))).toEqual(['/docs/a.md'])
  })

  it('ignores non-openable extensions even when the file exists', () => {
    const argv = ['lekha', '/docs/a.pdf', '/docs/b.png']
    expect(markdownPathsFromArgv(argv, opts(['/docs/a.pdf', '/docs/b.png']))).toEqual([])
  })

  it('ignores openable paths that do not exist (e.g. dev entry "." or stale args)', () => {
    const argv = ['lekha', '.', '/docs/missing.md']
    // Neither "." nor the missing file is in the existing set.
    expect(markdownPathsFromArgv(argv, opts([]))).toEqual([])
  })

  it('keeps argv order and de-duplicates repeated paths', () => {
    const argv = ['lekha', '/docs/a.md', '/docs/b.md', '/docs/a.md']
    expect(
      markdownPathsFromArgv(argv, opts(['/docs/a.md', '/docs/b.md'])),
    ).toEqual(['/docs/a.md', '/docs/b.md'])
  })

  it('returns an empty array for an argv with no file arguments', () => {
    expect(markdownPathsFromArgv(['lekha'], opts([]))).toEqual([])
    expect(markdownPathsFromArgv([], opts([]))).toEqual([])
  })
})
