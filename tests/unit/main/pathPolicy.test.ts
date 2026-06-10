// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import {
  allowFile,
  allowRoot,
  isPathAllowed,
  assertPathAllowed,
  _resetPathPolicy,
} from '@main/pathPolicy'

beforeEach(() => {
  _resetPathPolicy()
})

describe('pathPolicy', () => {
  it('denies everything by default', () => {
    expect(isPathAllowed('/etc/passwd')).toBe(false)
    expect(() => assertPathAllowed('/etc/passwd')).toThrow(/not permitted/)
  })

  it('allows an exact file but not its siblings', () => {
    allowFile('/docs/note.md')
    expect(isPathAllowed('/docs/note.md')).toBe(true)
    expect(isPathAllowed('/docs/other.md')).toBe(false)
    expect(isPathAllowed('/docs')).toBe(false)
  })

  it('allows everything under a root, but not the parent or siblings of the root', () => {
    allowRoot('/vault')
    expect(isPathAllowed('/vault')).toBe(true)
    expect(isPathAllowed('/vault/a.md')).toBe(true)
    expect(isPathAllowed('/vault/sub/deep/b.md')).toBe(true)
    expect(isPathAllowed('/vault-other/a.md')).toBe(false)
    expect(isPathAllowed('/')).toBe(false)
  })

  it('is not fooled by .. traversal out of an allowed root', () => {
    allowRoot('/vault')
    expect(isPathAllowed('/vault/../etc/passwd')).toBe(false)
    expect(isPathAllowed('/vault/sub/../a.md')).toBe(true)
  })

  it('ignores empty registrations', () => {
    allowFile('')
    allowRoot('')
    expect(isPathAllowed('')).toBe(false)
  })

  it('trailing separators do not change the decision', () => {
    allowRoot('/vault/')
    expect(isPathAllowed('/vault/a.md')).toBe(true)
  })

  it('matches case-insensitively on macOS/Windows (default-case-insensitive filesystems)', () => {
    allowRoot('/Vault')
    const expected = process.platform === 'darwin' || process.platform === 'win32'
    expect(isPathAllowed('/vault/a.md')).toBe(expected)
  })
})
