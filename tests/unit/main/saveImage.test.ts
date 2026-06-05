// @vitest-environment node
/**
 * Unit tests for the image-saving helpers in src/main/ipc/images.ts.
 *
 * Covers:
 *  - extFromMime: MIME-to-extension mapping
 *  - resolveImageTarget: pure path resolver (no I/O)
 *  - saveImageToDisk: integration test against a real temp directory
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { extFromMime } from '../../../src/shared/image'
import {
  resolveImageTarget,
  saveImageToDisk,
  _resetCounter,
} from '../../../src/main/ipc/images'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-img-'))
  _resetCounter()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// extFromMime
// ---------------------------------------------------------------------------

describe('extFromMime', () => {
  it('maps image/png to png', () => {
    expect(extFromMime('image/png')).toBe('png')
  })

  it('maps image/jpeg to jpg', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg')
  })

  it('maps image/jpg to jpg', () => {
    expect(extFromMime('image/jpg')).toBe('jpg')
  })

  it('maps image/gif to gif', () => {
    expect(extFromMime('image/gif')).toBe('gif')
  })

  it('maps image/webp to webp', () => {
    expect(extFromMime('image/webp')).toBe('webp')
  })

  it('maps image/svg+xml to svg', () => {
    expect(extFromMime('image/svg+xml')).toBe('svg')
  })

  it('falls back to png for unknown types', () => {
    expect(extFromMime('application/octet-stream')).toBe('png')
  })

  it('strips MIME params like charset before lookup', () => {
    expect(extFromMime('image/png; charset=utf-8')).toBe('png')
  })

  it('is case-insensitive', () => {
    expect(extFromMime('IMAGE/PNG')).toBe('png')
  })
})

// ---------------------------------------------------------------------------
// resolveImageTarget - saved document
// ---------------------------------------------------------------------------

describe('resolveImageTarget - saved document', () => {
  const userData = '/var/userData'

  it('dir is assets/ sibling of the document', () => {
    const target = resolveImageTarget('/notes/doc.md', 'png', 1, userData)
    expect(target.dir).toBe(join('/notes', 'assets'))
  })

  it('filename matches image-<padded>.<ext>', () => {
    const target = resolveImageTarget('/notes/doc.md', 'png', 1, userData)
    expect(target.filename).toBe('image-000001.png')
  })

  it('insertPath is a POSIX relative path assets/<filename>', () => {
    const target = resolveImageTarget('/notes/doc.md', 'png', 1, userData)
    expect(target.insertPath).toBe('assets/image-000001.png')
    // Must use forward slashes regardless of platform
    expect(target.insertPath).not.toContain('\\')
  })

  it('counter is zero-padded to 6 digits', () => {
    const target = resolveImageTarget('/notes/doc.md', 'jpg', 42, userData)
    expect(target.filename).toBe('image-000042.jpg')
  })

  it('works with deeply nested document paths', () => {
    const target = resolveImageTarget('/a/b/c/doc.md', 'gif', 3, userData)
    expect(target.dir).toBe(join('/a/b/c', 'assets'))
    expect(target.insertPath).toBe('assets/image-000003.gif')
  })
})

// ---------------------------------------------------------------------------
// resolveImageTarget - unsaved document
// ---------------------------------------------------------------------------

describe('resolveImageTarget - unsaved document', () => {
  it('dir is userData/images when docPath is null', () => {
    const target = resolveImageTarget(null, 'png', 1, '/userData')
    expect(target.dir).toBe(join('/userData', 'images'))
  })

  it('insertPath starts with file://', () => {
    const target = resolveImageTarget(null, 'png', 1, '/userData')
    expect(target.insertPath).toMatch(/^file:\/\//)
  })

  it('insertPath contains the filename', () => {
    const target = resolveImageTarget(null, 'png', 1, '/userData')
    expect(target.insertPath).toContain('image-000001.png')
  })

  it('insertPath contains the images directory', () => {
    const target = resolveImageTarget(null, 'webp', 5, '/userData')
    expect(target.insertPath).toContain('images')
    expect(target.insertPath).toContain('image-000005.webp')
  })
})

// ---------------------------------------------------------------------------
// saveImageToDisk - fs integration
// ---------------------------------------------------------------------------

describe('saveImageToDisk', () => {
  it('writes the image bytes to disk (saved doc path)', async () => {
    const docPath = join(tmpDir, 'notes', 'doc.md')
    const bytes = new Uint8Array([137, 80, 78, 71]) // PNG magic bytes

    const result = await saveImageToDisk(
      { data: bytes, ext: 'png', docPath },
      tmpDir, // userData = tmpDir (unused when docPath is set)
    )

    expect(result.insertPath).toBe('assets/image-000001.png')

    const writtenPath = join(tmpDir, 'notes', 'assets', 'image-000001.png')
    expect(existsSync(writtenPath)).toBe(true)

    const read = readFileSync(writtenPath)
    expect(Array.from(read)).toEqual([137, 80, 78, 71])
  })

  it('creates the assets directory if it does not exist', async () => {
    const docPath = join(tmpDir, 'doc.md')
    await saveImageToDisk({ data: new Uint8Array([0, 1, 2]), ext: 'png', docPath }, tmpDir)
    expect(existsSync(join(tmpDir, 'assets'))).toBe(true)
  })

  it('writes to userData/images when docPath is null', async () => {
    const userData = join(tmpDir, 'ud')
    const bytes = new Uint8Array([1, 2, 3])

    const result = await saveImageToDisk({ data: bytes, ext: 'jpg', docPath: null }, userData)

    expect(result.insertPath).toMatch(/^file:\/\//)
    expect(result.insertPath).toContain('image-000001.jpg')

    const imagesDir = join(userData, 'images')
    expect(existsSync(imagesDir)).toBe(true)
  })

  it('accepts an ArrayBuffer as data', async () => {
    const docPath = join(tmpDir, 'doc.md')
    const ab = new ArrayBuffer(4)
    const view = new Uint8Array(ab)
    view.set([10, 20, 30, 40])

    await saveImageToDisk({ data: ab, ext: 'png', docPath }, tmpDir)

    const writtenPath = join(tmpDir, 'assets', 'image-000001.png')
    const read = readFileSync(writtenPath)
    expect(Array.from(read)).toEqual([10, 20, 30, 40])
  })

  it('bumps the counter if the target file already exists', async () => {
    const docPath = join(tmpDir, 'doc.md')
    const bytes = new Uint8Array([0xff])

    // First write occupies counter 1
    const r1 = await saveImageToDisk({ data: bytes, ext: 'png', docPath }, tmpDir)
    expect(r1.insertPath).toBe('assets/image-000001.png')

    // Second write should use counter 2
    const r2 = await saveImageToDisk({ data: bytes, ext: 'png', docPath }, tmpDir)
    expect(r2.insertPath).toBe('assets/image-000002.png')
  })
})

// ---------------------------------------------------------------------------
// resolveImageTarget - path-traversal guard (security)
// ---------------------------------------------------------------------------

describe('resolveImageTarget - extension sanitization', () => {
  const userData = '/var/userData'

  it('strips path-traversal characters from the extension', () => {
    // A crafted ext like '../../etc/evil' must not escape the assets/ dir.
    const target = resolveImageTarget('/notes/doc.md', '../../etc/evil', 1, userData)

    // The resulting dir must stay within the document's assets/ sibling.
    const expectedDir = join('/notes', 'assets')
    expect(target.dir).toBe(expectedDir)

    // The insertPath must not contain any '..' components.
    expect(target.insertPath).not.toContain('..')

    // The extension is reduced to alphanumerics only ('etcevil').
    expect(target.filename).toMatch(/^image-000001\.[a-zA-Z0-9]+$/)
    expect(target.insertPath).toMatch(/^assets\/image-000001\.[a-zA-Z0-9]+$/)
  })

  it('falls back to "png" when the sanitized extension is empty', () => {
    // An ext composed entirely of non-alphanumeric chars becomes empty after
    // sanitization, so the fallback 'png' must be used.
    const target = resolveImageTarget('/notes/doc.md', '...//\\', 1, userData)
    expect(target.filename).toBe('image-000001.png')
    expect(target.insertPath).toBe('assets/image-000001.png')
  })

  it('truncates extensions longer than 10 characters', () => {
    const target = resolveImageTarget('/notes/doc.md', 'averylongextension', 1, userData)
    // 'averylonge' is the first 10 chars of 'averylongextension'
    expect(target.filename).toBe('image-000001.averylonge')
  })
})
