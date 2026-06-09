/**
 * replaceInFolder: replaces matches across the markdown files under a root,
 * skipping skipPaths, writing changed files atomically. Tested against a temp dir.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replaceInFolderFiles } from '../../../src/main/ipc/replace'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'lekha-replace-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('replaceInFolderFiles', () => {
  it('replaces matches in matching files and reports counts', async () => {
    const a = join(dir, 'a.md'); const b = join(dir, 'b.md'); const c = join(dir, 'c.md')
    await writeFile(a, 'cat cat', 'utf8')
    await writeFile(b, 'a cat here', 'utf8')
    await writeFile(c, 'no match', 'utf8')

    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: false, skipPaths: [],
    })

    expect(res.replacements).toBe(3)
    expect(res.filesChanged).toBe(2)
    expect(res.changedPaths.sort()).toEqual([a, b].sort())
    expect(await readFile(a, 'utf8')).toBe('dog dog')
    expect(await readFile(b, 'utf8')).toBe('a dog here')
    expect(await readFile(c, 'utf8')).toBe('no match')
  })

  it('never writes a file in skipPaths', async () => {
    const a = join(dir, 'a.md')
    await writeFile(a, 'cat', 'utf8')
    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: false, skipPaths: [a],
    })
    expect(res.filesChanged).toBe(0)
    expect(await readFile(a, 'utf8')).toBe('cat')
  })

  it('honors whole-word', async () => {
    const a = join(dir, 'a.md')
    await writeFile(a, 'cat cats', 'utf8')
    const res = await replaceInFolderFiles({
      root: dir, query: 'cat', replacement: 'dog',
      caseSensitive: false, wholeWord: true, skipPaths: [],
    })
    expect(res.replacements).toBe(1)
    expect(await readFile(a, 'utf8')).toBe('dog cats')
  })

  it('returns zeros for an empty query', async () => {
    const res = await replaceInFolderFiles({
      root: dir, query: '', replacement: 'x',
      caseSensitive: false, wholeWord: false, skipPaths: [],
    })
    expect(res).toEqual({ filesChanged: 0, replacements: 0, changedPaths: [] })
  })
})
