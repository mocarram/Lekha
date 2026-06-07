// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildFileTree, writeFileAtomic, readTextFile, statFile, deriveArticleTitle, deriveArticlePreview, listArticles } from '@main/fs-helpers'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-fs-'))

  // Layout:
  //   a.md
  //   b.txt          <- should be excluded
  //   Zed.md
  //   .hidden.md     <- dotfile, excluded
  //   sub/
  //     c.md
  mkdirSync(join(tmpDir, 'sub'))
  writeFileSync(join(tmpDir, 'a.md'), '# A', 'utf8')
  writeFileSync(join(tmpDir, 'b.txt'), 'plain', 'utf8')
  writeFileSync(join(tmpDir, 'Zed.md'), '# Zed', 'utf8')
  writeFileSync(join(tmpDir, '.hidden.md'), '# Hidden', 'utf8')
  writeFileSync(join(tmpDir, 'sub', 'c.md'), '# C', 'utf8')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('buildFileTree', () => {
  it('returns directories before files', async () => {
    const tree = await buildFileTree(tmpDir)
    const firstIsDir = tree[0]?.isDirectory
    expect(firstIsDir).toBe(true)
  })

  it('lists directories first, then .md files, all case-insensitive alphabetical', async () => {
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    // dirs first, then md files sorted: a.md < Zed.md (case-insensitive a < z)
    expect(names).toEqual(['sub', 'a.md', 'Zed.md'])
  })

  it('excludes b.txt (non-md file)', async () => {
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    expect(names).not.toContain('b.txt')
  })

  it('excludes dotfiles (.hidden.md)', async () => {
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    expect(names).not.toContain('.hidden.md')
  })

  it('nests sub/c.md under the sub directory', async () => {
    const tree = await buildFileTree(tmpDir)
    const subNode = tree.find((n) => n.name === 'sub')
    expect(subNode).toBeDefined()
    expect(subNode?.isDirectory).toBe(true)
    const children = subNode?.children ?? []
    expect(children).toHaveLength(1)
    expect(children[0]?.name).toBe('c.md')
    expect(children[0]?.isDirectory).toBe(false)
  })

  it('uses absolute paths for each node', async () => {
    const tree = await buildFileTree(tmpDir)
    const aMd = tree.find((n) => n.name === 'a.md')
    expect(aMd?.path).toBe(join(tmpDir, 'a.md'))
  })

  it('skips node_modules', async () => {
    mkdirSync(join(tmpDir, 'node_modules'))
    writeFileSync(join(tmpDir, 'node_modules', 'pkg.md'), '', 'utf8')
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    expect(names).not.toContain('node_modules')
  })
})

describe('writeFileAtomic', () => {
  it('writes content to the target file', async () => {
    const target = join(tmpDir, 'out.md')
    await writeFileAtomic(target, '# Hello')
    const content = await readTextFile(target)
    expect(content).toBe('# Hello')
  })

  it('leaves no .tmp file after writing', async () => {
    const target = join(tmpDir, 'out.md')
    await writeFileAtomic(target, 'data')
    expect(existsSync(`${target}.tmp`)).toBe(false)
  })
})

describe('readTextFile', () => {
  it('round-trips written content', async () => {
    const target = join(tmpDir, 'rt.md')
    writeFileSync(target, '# Round-trip test\nLine 2', 'utf8')
    const content = await readTextFile(target)
    expect(content).toBe('# Round-trip test\nLine 2')
  })
})

describe('statFile', () => {
  it('returns the byte size and timestamps for a file', async () => {
    const st = await statFile(join(tmpDir, 'a.md'))
    expect(st.sizeBytes).toBeGreaterThan(0)
    expect(typeof st.mtimeMs).toBe('number')
    expect(typeof st.birthtimeMs).toBe('number')
  })
})

describe('deriveArticleTitle / deriveArticlePreview (pure)', () => {
  it('uses the first # heading as the title', () => {
    expect(deriveArticleTitle('# My Note\n\nbody', '/x/a.md')).toBe('My Note')
  })
  it('falls back to the basename when there is no heading', () => {
    expect(deriveArticleTitle('just text', '/x/a.md')).toBe('a.md')
  })
  it('builds a single-line preview excluding the heading', () => {
    const pv = deriveArticlePreview('# Title\n\nFirst paragraph body.')
    expect(pv).toContain('First paragraph body')
    expect(pv).not.toContain('#')
  })
})

describe('listArticles (IO)', () => {
  it('lists every md file recursively, newest first, with title + preview', async () => {
    const list = await listArticles(tmpDir)
    const paths = list.map((a) => a.path)
    expect(paths).toContain(join(tmpDir, 'a.md'))
    expect(paths).toContain(join(tmpDir, 'sub', 'c.md'))
    // b.txt is excluded; dotfiles excluded.
    expect(paths.some((p) => p.endsWith('b.txt'))).toBe(false)
    const a = list.find((x) => x.path === join(tmpDir, 'a.md'))!
    expect(a.title).toBe('A')
    expect(typeof a.mtimeMs).toBe('number')
    // Sorted by mtime descending.
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.mtimeMs).toBeGreaterThanOrEqual(list[i]!.mtimeMs)
    }
  })
})
