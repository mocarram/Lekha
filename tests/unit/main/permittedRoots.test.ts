// @vitest-environment node
/**
 * Tests for the filesystem path allowlist (src/main/permittedRoots.ts).
 *
 * The allowlist is the main-process trust boundary: a renderer-supplied path is
 * only honoured by the file IPC handlers when it was previously granted (a
 * dialog result, an opened folder, a recent file's dir, or always-permitted
 * infrastructure dirs). These tests exercise grant + containment + rejection in
 * isolation, resetting the in-memory Set between cases.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { join, resolve, sep } from 'node:path'
import {
  grantRoot,
  grantManyRoots,
  isPathAllowed,
  resetPermittedRoots,
} from '@main/permittedRoots'

beforeEach(() => {
  resetPermittedRoots()
})

describe('isPathAllowed', () => {
  it('allows a path that was granted as an exact file', () => {
    const file = resolve('/vault/notes/a.md')
    grantRoot(file)
    expect(isPathAllowed(file)).toBe(true)
  })

  it('rejects a sibling file when only a single file was granted', () => {
    grantRoot(resolve('/vault/notes/a.md'))
    expect(isPathAllowed(resolve('/vault/notes/b.md'))).toBe(false)
  })

  it('allows a file contained within a granted directory', () => {
    const dir = resolve('/vault/notes')
    grantRoot(dir)
    expect(isPathAllowed(join(dir, 'a.md'))).toBe(true)
    expect(isPathAllowed(join(dir, 'sub', 'deep.md'))).toBe(true)
    // The directory itself is allowed too (readDir / listArticles / search).
    expect(isPathAllowed(dir)).toBe(true)
  })

  it('rejects a path outside every granted directory', () => {
    grantRoot(resolve('/vault/notes'))
    expect(isPathAllowed(resolve('/etc/passwd'))).toBe(false)
    expect(isPathAllowed(resolve('/vault/other/secret.md'))).toBe(false)
  })

  it('rejects a sibling dir that shares a name prefix (no startsWith bypass)', () => {
    // /vault/notes must NOT permit /vault/notes-evil even though the string
    // /vault/notes-evil startsWith /vault/notes. The sep guard prevents this.
    grantRoot(resolve('/vault/notes'))
    expect(isPathAllowed(resolve('/vault/notes-evil/x.md'))).toBe(false)
  })

  it('rejects a path that escapes a granted dir via .. traversal', () => {
    grantRoot(resolve('/vault/notes'))
    // resolve collapses the traversal to /vault/secret which is outside the grant.
    expect(isPathAllowed('/vault/notes/../secret/keys.md')).toBe(false)
  })

  it('allows a path that uses .. but resolves back inside the granted dir', () => {
    grantRoot(resolve('/vault/notes'))
    expect(isPathAllowed('/vault/notes/sub/../a.md')).toBe(true)
  })

  it('rejects blank / non-string input', () => {
    grantRoot(resolve('/vault/notes'))
    expect(isPathAllowed('')).toBe(false)
    expect(isPathAllowed('   ')).toBe(false)
    expect(isPathAllowed(undefined as unknown as string)).toBe(false)
  })

  it('returns false when nothing has been granted', () => {
    expect(isPathAllowed(resolve('/anything'))).toBe(false)
  })
})

describe('grantRoot / grantManyRoots normalization', () => {
  it('grantManyRoots grants every entry', () => {
    grantManyRoots([resolve('/a'), resolve('/b')])
    expect(isPathAllowed(join(resolve('/a'), 'x'))).toBe(true)
    expect(isPathAllowed(join(resolve('/b'), 'y'))).toBe(true)
  })

  it('ignores blank grant inputs (never grants the cwd via "")', () => {
    grantRoot('')
    grantRoot('   ')
    // Nothing was granted, so an arbitrary path under cwd is still rejected.
    expect(isPathAllowed(join(process.cwd(), 'whatever.md'))).toBe(false)
  })

  it('normalizes granted paths so a non-normalized check still matches', () => {
    grantRoot('/vault/notes/sub/..')
    expect(isPathAllowed(resolve('/vault/notes/a.md'))).toBe(true)
  })
})

describe('a representative userData-style infrastructure grant', () => {
  it('permits files under a granted userData dir (as wired at startup)', () => {
    const userData = resolve('/Users/test/Library/Application Support/Lekha')
    grantRoot(userData)
    expect(isPathAllowed(userData + sep + 'backups' + sep + 'b.json')).toBe(true)
    expect(isPathAllowed(resolve('/Users/test/other.md'))).toBe(false)
  })
})
