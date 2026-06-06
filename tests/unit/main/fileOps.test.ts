/**
 * Unit tests for the PURE file-operation helpers in src/main/fileOps.ts.
 *
 * Only the pure path/name helpers are tested here. The fs/shell calls
 * (createFile, createFolder, renamePath, deletePath, revealPath) are
 * Electron/IO-bound thin wrappers and are exercised manually, not unit-tested.
 */
import { describe, it, expect } from 'vitest'
import { isValidEntryName, targetPath, renamedPath } from '../../../src/main/fileOps'

describe('isValidEntryName', () => {
  it('accepts a plain markdown filename', () => {
    expect(isValidEntryName('notes.md')).toBe(true)
  })

  it('accepts a folder name with spaces', () => {
    expect(isValidEntryName('My Folder')).toBe(true)
  })

  it('rejects an empty name', () => {
    expect(isValidEntryName('')).toBe(false)
  })

  it('rejects a whitespace-only name', () => {
    expect(isValidEntryName('   ')).toBe(false)
  })

  it('rejects a name containing a forward slash (path separator)', () => {
    expect(isValidEntryName('a/b')).toBe(false)
  })

  it('rejects a name containing a backslash (Windows path separator)', () => {
    expect(isValidEntryName('a\\b')).toBe(false)
  })

  it('rejects a parent-traversal name', () => {
    expect(isValidEntryName('..')).toBe(false)
  })

  it('rejects a traversal name with a separator', () => {
    expect(isValidEntryName('../x')).toBe(false)
  })

  it('rejects a single dot (current dir)', () => {
    expect(isValidEntryName('.')).toBe(false)
  })
})

describe('targetPath', () => {
  it('joins the directory and the name', () => {
    expect(targetPath('/home/me/notes', 'todo.md')).toBe('/home/me/notes/todo.md')
  })

  it('defaults to a .md extension when the name has no extension', () => {
    expect(targetPath('/home/me/notes', 'todo')).toBe('/home/me/notes/todo.md')
  })

  it('keeps a non-markdown extension as-is', () => {
    expect(targetPath('/home/me/notes', 'data.json')).toBe('/home/me/notes/data.json')
  })

  it('does not add .md when allowMissingExt is set (folder creation)', () => {
    expect(targetPath('/home/me/notes', 'Sub Folder', { allowMissingExt: true })).toBe(
      '/home/me/notes/Sub Folder',
    )
  })

  it('still keeps an extension when allowMissingExt is set', () => {
    expect(targetPath('/home/me/notes', 'a.md', { allowMissingExt: true })).toBe(
      '/home/me/notes/a.md',
    )
  })
})

describe('renamedPath', () => {
  it('renames within the same parent directory', () => {
    expect(renamedPath('/home/me/notes/old.md', 'new.md')).toBe('/home/me/notes/new.md')
  })

  it('preserves the parent directory of a nested file', () => {
    expect(renamedPath('/a/b/c/file.md', 'renamed.md')).toBe('/a/b/c/renamed.md')
  })

  it('renames a directory in place', () => {
    expect(renamedPath('/a/b/docs', 'guides')).toBe('/a/b/guides')
  })

  it('does NOT default a missing extension (rename keeps the exact new name)', () => {
    expect(renamedPath('/a/b/old.md', 'README')).toBe('/a/b/README')
  })
})
