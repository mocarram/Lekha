/**
 * Tests for the listUserTemplates helper.
 *
 * listUserTemplates(dir) reads *.md files from a given directory and returns
 * Template objects derived from the filename (without extension) and content.
 * It returns an empty array when the directory does not exist.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listUserTemplates } from '../../../src/main/templates'

let tmpDir: string | null = null

afterEach(async () => {
  if (tmpDir) {
    await rm(tmpDir, { recursive: true, force: true })
    tmpDir = null
  }
})

async function makeDir(): Promise<string> {
  tmpDir = await mkdtemp(join(tmpdir(), 'lekha-templates-test-'))
  return tmpDir
}

describe('listUserTemplates', () => {
  it('returns an empty array when the directory does not exist', async () => {
    const result = await listUserTemplates('/nonexistent/path/that/does/not/exist')
    expect(result).toEqual([])
  })

  it('returns templates for each .md file in the directory', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'My Template.md'), '# My Template\n\nContent.', 'utf8')
    await writeFile(join(dir, 'Another.md'), '# Another\n\nMore.', 'utf8')

    const result = await listUserTemplates(dir)
    expect(result).toHaveLength(2)

    const ids = result.map((t) => t.id).sort()
    expect(ids).toEqual(['Another', 'My Template'].sort())
  })

  it('derives the template name from the filename without extension', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'Weekly Review.md'), '# Weekly Review', 'utf8')

    const result = await listUserTemplates(dir)
    expect(result[0]?.name).toBe('Weekly Review')
  })

  it('uses the filename (without ext) as the id', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'my-note.md'), '# My Note', 'utf8')

    const result = await listUserTemplates(dir)
    expect(result[0]?.id).toBe('my-note')
  })

  it('reads the file content correctly', async () => {
    const dir = await makeDir()
    const content = '# Custom Template\n\nThis is the content.'
    await writeFile(join(dir, 'custom.md'), content, 'utf8')

    const result = await listUserTemplates(dir)
    expect(result[0]?.content).toBe(content)
  })

  it('ignores non-.md files', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'template.md'), '# Template', 'utf8')
    await writeFile(join(dir, 'notes.txt'), 'plain text', 'utf8')
    await writeFile(join(dir, 'image.png'), 'binary', 'utf8')

    const result = await listUserTemplates(dir)
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('template')
  })

  it('ignores subdirectories', async () => {
    const dir = await makeDir()
    await writeFile(join(dir, 'valid.md'), '# Valid', 'utf8')
    await mkdir(join(dir, 'subdir'))
    // A .md filename that is actually a directory (edge case)
    // Just verify normal subdir is ignored
    const result = await listUserTemplates(dir)
    expect(result).toHaveLength(1)
  })

  it('returns an empty array for an empty directory', async () => {
    const dir = await makeDir()
    const result = await listUserTemplates(dir)
    expect(result).toEqual([])
  })
})
