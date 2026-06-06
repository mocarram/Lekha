/**
 * Unit tests for flattenFiles (src/renderer/commands/files.ts).
 *
 * Flattens the workspace FileNode tree into the flat list quick-open consumes:
 * Markdown files only, in tree order, with a root-relative directory hint.
 */
import { describe, it, expect } from 'vitest'
import { flattenFiles } from '../../../src/renderer/commands/files'
import type { FileNode } from '../../../src/shared/types'

const tree: FileNode[] = [
  { name: 'readme.md', path: '/root/readme.md', isDirectory: false },
  { name: 'image.png', path: '/root/image.png', isDirectory: false },
  {
    name: 'notes',
    path: '/root/notes',
    isDirectory: true,
    children: [
      { name: 'todo.md', path: '/root/notes/todo.md', isDirectory: false },
      { name: 'data.json', path: '/root/notes/data.json', isDirectory: false },
    ],
  },
]

describe('flattenFiles', () => {
  it('keeps only Markdown files, in tree order', () => {
    const out = flattenFiles(tree, '/root')
    expect(out.map((f) => f.name)).toEqual(['readme.md', 'todo.md'])
  })

  it('computes the root-relative directory ("" for root files)', () => {
    const out = flattenFiles(tree, '/root')
    expect(out.find((f) => f.name === 'readme.md')?.dir).toBe('')
    expect(out.find((f) => f.name === 'todo.md')?.dir).toBe('notes')
  })

  it('returns an empty list for an empty tree', () => {
    expect(flattenFiles([], '/root')).toEqual([])
  })

  it('falls back to the absolute dir when root is null', () => {
    const out = flattenFiles(tree, null)
    expect(out.find((f) => f.name === 'todo.md')?.dir).toBe('/root/notes')
  })
})
