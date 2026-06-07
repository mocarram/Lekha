// @vitest-environment node
/**
 * Focused test for the listArticles TOCTOU guard.
 *
 * A markdown file can be deleted between enumeration (collectMarkdownFiles) and
 * the per-entry stat(). Previously stat() was unguarded, so one vanished file
 * rejected Promise.all and blanked the entire Articles list. The fix guards each
 * entry and drops the ones that fail.
 *
 * We mock node:fs/promises so stat() rejects with ENOENT for exactly one path
 * while everything else passes through to the real implementation. This makes
 * the otherwise-racy condition deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type * as FsPromises from 'node:fs/promises'

let missingPath = ''

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>()
  return {
    ...actual,
    stat: (p: Parameters<typeof actual.stat>[0], ...rest: never[]) => {
      if (p === missingPath) {
        return Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
      }
      return (actual.stat as (...a: unknown[]) => unknown)(p, ...rest)
    },
  }
})

import { listArticles } from '@main/fs-helpers'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-toctou-'))
  mkdirSync(join(tmpDir, 'sub'))
  writeFileSync(join(tmpDir, 'a.md'), '# A', 'utf8')
  writeFileSync(join(tmpDir, 'Zed.md'), '# Zed', 'utf8')
  writeFileSync(join(tmpDir, 'sub', 'c.md'), '# C', 'utf8')
  missingPath = join(tmpDir, 'a.md')
})

afterEach(() => {
  missingPath = ''
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('listArticles - TOCTOU resilience', () => {
  it('drops a file whose stat fails and keeps the rest of the list', async () => {
    const list = await listArticles(tmpDir)
    const paths = list.map((a) => a.path)
    // a.md vanished between enumeration and stat -> dropped.
    expect(paths).not.toContain(join(tmpDir, 'a.md'))
    // The other files survive (the list is NOT blanked).
    expect(paths).toContain(join(tmpDir, 'Zed.md'))
    expect(paths).toContain(join(tmpDir, 'sub', 'c.md'))
    expect(list).toHaveLength(2)
  })
})
