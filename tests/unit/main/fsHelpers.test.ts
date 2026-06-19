// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { buildFileTree, listDirChildren, writeFileAtomic, readTextFile, statFile, verifyOpenFile, findPathByInode, deriveArticleTitle, deriveArticlePreview, listArticles } from '@main/fs-helpers'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-fs-'))

  // Layout:
  //   a.md
  //   b.txt          <- openable plain text, included
  //   d.png          <- not openable, excluded
  //   Zed.md
  //   .hidden.md     <- dotfile, excluded
  //   sub/
  //     c.md
  mkdirSync(join(tmpDir, 'sub'))
  writeFileSync(join(tmpDir, 'a.md'), '# A', 'utf8')
  writeFileSync(join(tmpDir, 'b.txt'), 'plain', 'utf8')
  writeFileSync(join(tmpDir, 'd.png'), 'not text', 'utf8')
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

  it('lists directories first, then openable files, all case-insensitive alphabetical', async () => {
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    // dirs first, then files sorted case-insensitively: a.md < b.txt < Zed.md
    expect(names).toEqual(['sub', 'a.md', 'b.txt', 'Zed.md'])
  })

  it('includes openable plain text (b.txt) and excludes non-text files (d.png)', async () => {
    const tree = await buildFileTree(tmpDir)
    const names = tree.map((n) => n.name)
    expect(names).toContain('b.txt')
    expect(names).not.toContain('d.png')
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

describe('listDirChildren', () => {
  it('returns only the immediate level; sub-directories are left unloaded', async () => {
    mkdirSync(join(tmpDir, 'lvl-sub'), { recursive: true })
    writeFileSync(join(tmpDir, 'lvl-a.md'), '# a', 'utf8')
    writeFileSync(join(tmpDir, 'lvl-sub', 'nested.md'), '# n', 'utf8')

    const level = await listDirChildren(tmpDir)

    const sub = level.find((n) => n.name === 'lvl-sub')
    expect(sub).toBeDefined()
    expect(sub!.isDirectory).toBe(true)
    expect(sub!.children).toBeUndefined()
    expect(level.find((n) => n.name === 'lvl-a.md')?.isDirectory).toBe(false)
  })

  it('excludes dotfiles, dotdirs, node_modules and non-openable files', async () => {
    mkdirSync(join(tmpDir, 'node_modules'), { recursive: true })
    mkdirSync(join(tmpDir, '.git'), { recursive: true })
    writeFileSync(join(tmpDir, '.hidden2.md'), 'x', 'utf8')
    writeFileSync(join(tmpDir, 'image.png'), 'x', 'utf8')
    writeFileSync(join(tmpDir, 'keep.md'), 'x', 'utf8')

    const level = await listDirChildren(tmpDir)
    const names = level.map((n) => n.name)

    expect(names).toContain('keep.md')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.git')
    expect(names).not.toContain('.hidden2.md')
    expect(names).not.toContain('image.png')
  })

  it('sorts directories first, then files, each case-insensitive', async () => {
    // Use a fresh empty dir so the shared beforeEach fixtures do not perturb
    // the expected ordering for this exact-equality assertion.
    const dir = mkdtempSync(join(tmpdir(), 'lekha-fs-sort-'))
    try {
      mkdirSync(join(dir, 'Zeta'), { recursive: true })
      mkdirSync(join(dir, 'alpha'), { recursive: true })
      writeFileSync(join(dir, 'Beta.md'), 'x', 'utf8')
      writeFileSync(join(dir, 'apple.md'), 'x', 'utf8')

      const level = await listDirChildren(dir)

      expect(level.map((n) => n.name)).toEqual(['alpha', 'Zeta', 'apple.md', 'Beta.md'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

  it('survives concurrent writes to the SAME path without ENOENT (unique tmp per write)', async () => {
    // Regression: a fixed `${path}.tmp` name made concurrent writes to one path
    // (e.g. rapid crash-backup writes for a single tab) race - the first rename
    // consumed the shared tmp, the rest failed with ENOENT on rename.
    const target = join(tmpDir, 'concurrent.json')
    const writes = Array.from({ length: 12 }, (_v, i) =>
      writeFileAtomic(target, `content-${i}`),
    )
    // None of the concurrent writes should reject.
    await expect(Promise.all(writes)).resolves.toBeDefined()
    // The final file exists and holds one of the written payloads (last wins).
    const content = await readTextFile(target)
    expect(/^content-\d+$/.test(content)).toBe(true)
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
  it('lists every openable file recursively, newest first, with title + preview', async () => {
    const list = await listArticles(tmpDir)
    const paths = list.map((a) => a.path)
    expect(paths).toContain(join(tmpDir, 'a.md'))
    expect(paths).toContain(join(tmpDir, 'sub', 'c.md'))
    // Openable plain text included; non-text and dotfiles excluded.
    expect(paths.some((p) => p.endsWith('b.txt'))).toBe(true)
    expect(paths.some((p) => p.endsWith('d.png'))).toBe(false)
    const a = list.find((x) => x.path === join(tmpDir, 'a.md'))!
    expect(a.title).toBe('A')
    expect(typeof a.mtimeMs).toBe('number')
    // Sorted by mtime descending.
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1]!.mtimeMs).toBeGreaterThanOrEqual(list[i]!.mtimeMs)
    }
  })

  it('derives title + preview from the head of a large file (head-only read)', async () => {
    // 100KB body after the heading: the listing must NOT need the full file.
    const body = 'lorem ipsum '.repeat(9000)
    writeFileSync(join(tmpDir, 'big.md'), `# Big Title\n\nfirst words here. ${body}`, 'utf8')
    const list = await listArticles(tmpDir)
    const big = list.find((a) => a.path.endsWith('big.md'))!
    expect(big.title).toBe('Big Title')
    expect(big.preview).toContain('first words here')
    expect(big.sizeBytes).toBeGreaterThan(100_000)
  })
})

// ---------------------------------------------------------------------------
// statFile inode + findPathByInode + verifyOpenFile (external-rename recovery)
// ---------------------------------------------------------------------------
describe('statFile inode + verifyOpenFile', () => {
  it('statFile reports a non-zero inode', async () => {
    const st = await statFile(join(tmpDir, 'a.md'))
    expect(typeof st.inode).toBe('number')
    expect(st.inode).toBeGreaterThan(0)
  })

  it('verifyOpenFile returns present when the file is unchanged', async () => {
    const p = join(tmpDir, 'a.md')
    const { inode } = await statFile(p)
    expect(await verifyOpenFile(p, inode)).toEqual({ status: 'present' })
  })

  it('verifyOpenFile recovers a same-folder rename by inode', async () => {
    const p = join(tmpDir, 'a.md')
    const { inode } = await statFile(p)
    renameSync(p, join(tmpDir, 'a-renamed.md')) // Finder-style rename (keeps inode)
    expect(await verifyOpenFile(p, inode)).toEqual({
      status: 'renamed',
      newPath: join(tmpDir, 'a-renamed.md'),
    })
  })

  it('verifyOpenFile reports missing when the file is deleted/moved away', async () => {
    const p = join(tmpDir, 'a.md')
    const { inode } = await statFile(p)
    rmSync(p)
    expect(await verifyOpenFile(p, inode)).toEqual({ status: 'missing' })
  })

  it('findPathByInode returns null for an inode not present in the dir', async () => {
    expect(await findPathByInode(tmpDir, 99999999)).toBeNull()
  })
})
