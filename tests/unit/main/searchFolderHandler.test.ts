// @vitest-environment node
/**
 * Focused tests for the registerSearchHandlers IPC contract.
 *
 * registerSearchHandlers() registers an ipcMain.handle handler that we cannot
 * reach through Electron in vitest, so we mock 'electron' to capture the
 * registered handler function and invoke it directly. This exercises the real
 * handler body (including the collectMarkdownPaths try/catch), unlike
 * searchFolder.test.ts which replicates the logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Capture the handler functions keyed by channel as they are registered.
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
  },
}))

import { registerSearchHandlers, MAX_SEARCH_FILE_BYTES } from '@main/ipc/search'
import { IPC } from '@shared/ipc-channels'
import type { FolderSearchResult } from '@shared/types'

let tmpDir: string

beforeEach(() => {
  handlers.clear()
  registerSearchHandlers()
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-searchh-'))
  writeFileSync(join(tmpDir, 'notes.md'), '# Notes\nhello world\n', 'utf8')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Invoke the captured fs:searchFolder handler with a fake IPC event. */
async function invoke(root: string, query: string, caseSensitive = false): Promise<FolderSearchResult[]> {
  const handler = handlers.get(IPC.searchFolder)
  if (!handler) throw new Error('searchFolder handler not registered')
  return (await handler({}, { root, query, caseSensitive })) as FolderSearchResult[]
}

describe('registerSearchHandlers - fs:searchFolder', () => {
  it('returns matches for a readable root', async () => {
    const results = await invoke(tmpDir, 'hello')
    expect(results).toHaveLength(1)
    expect(results[0]?.fileName).toBe('notes.md')
  })

  it('returns [] (not a rejection) when the root does not exist / is unreadable', async () => {
    const missingRoot = join(tmpDir, 'does-not-exist')
    // A raw readdir on a missing dir would reject with ENOENT; the handler must
    // swallow that and degrade to an empty result (matching listBackups).
    await expect(invoke(missingRoot, 'hello')).resolves.toEqual([])
  })

  it('returns [] for an empty query without touching the filesystem', async () => {
    await expect(invoke(tmpDir, '')).resolves.toEqual([])
  })

  it('skips files larger than the per-file size cap', async () => {
    // An oversized file containing the query must be skipped (one stray huge
    // file must not be re-read into memory on every search keystroke).
    const big = 'hello '.repeat(Math.ceil((MAX_SEARCH_FILE_BYTES + 1024) / 6))
    writeFileSync(join(tmpDir, 'huge.md'), big, 'utf8')
    const results = await invoke(tmpDir, 'hello')
    expect(results.map((r) => r.fileName)).toEqual(['notes.md'])
  })

  it('searches many files concurrently and preserves enumeration order', async () => {
    for (let i = 0; i < 30; i++) {
      writeFileSync(join(tmpDir, `f${String(i).padStart(2, '0')}.md`), `hello ${i}\n`, 'utf8')
    }
    const results = await invoke(tmpDir, 'hello')
    const names = results.map((r) => r.fileName)
    // Deterministic: matches come back in the same (sorted) order the tree
    // enumerates, regardless of read concurrency.
    expect(names).toEqual([...names].sort())
    expect(names).toHaveLength(31)
  })
})
