import { describe, it, expect } from 'vitest'
import {
  OPENABLE_EXTENSIONS,
  OPENABLE_EXT_RE,
  OPENABLE_EXT_SET,
  isOpenablePath,
} from '../../../src/shared/openable'

describe('shared/openable', () => {
  it('accepts every supported extension, case-insensitively', () => {
    for (const ext of OPENABLE_EXTENSIONS) {
      expect(isOpenablePath(`/notes/file.${ext}`)).toBe(true)
      expect(isOpenablePath(`/notes/FILE.${ext.toUpperCase()}`)).toBe(true)
    }
  })

  it('rejects non-text files and lookalike extensions', () => {
    for (const p of ['/a/image.png', '/a/doc.pdf', '/a/file.mdq', '/a/file.txt.bak', '/a/md']) {
      expect(isOpenablePath(p)).toBe(false)
    }
  })

  it('the dotted set mirrors the extension list for extname() lookups', () => {
    expect(OPENABLE_EXT_SET.size).toBe(OPENABLE_EXTENSIONS.length)
    for (const ext of OPENABLE_EXTENSIONS) {
      expect(OPENABLE_EXT_SET.has(`.${ext}`)).toBe(true)
    }
  })

  it('the regex only matches at the end of the path', () => {
    expect(OPENABLE_EXT_RE.test('/a/file.md.png')).toBe(false)
    expect(OPENABLE_EXT_RE.test('/a/file.png.md')).toBe(true)
  })
})
