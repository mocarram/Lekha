import { describe, it, expect } from 'vitest'
import type { FileNode } from '../../../src/shared/types'
import {
  parentDir,
  mergePreserveLoaded,
  setNodeChildren,
  loadedDirPaths,
} from '../../../src/renderer/store/treeOps'

describe('parentDir', () => {
  it('returns the containing directory', () => {
    expect(parentDir('/proj/sub/a.md')).toBe('/proj/sub')
    expect(parentDir('/proj/a.md')).toBe('/proj')
  })
})

describe('mergePreserveLoaded', () => {
  it('carries over loaded sub-directory children when re-listing a level', () => {
    const prev: FileNode[] = [
      {
        name: 'sub',
        path: '/p/sub',
        isDirectory: true,
        children: [{ name: 'old.md', path: '/p/sub/old.md', isDirectory: false }],
      },
    ]
    const next: FileNode[] = [
      { name: 'new.md', path: '/p/new.md', isDirectory: false },
      { name: 'sub', path: '/p/sub', isDirectory: true }, // freshly listed: unloaded
    ]
    const merged = mergePreserveLoaded(prev, next)
    const sub = merged.find((n) => n.path === '/p/sub')!
    expect(sub.children).toEqual([{ name: 'old.md', path: '/p/sub/old.md', isDirectory: false }])
    expect(merged.find((n) => n.path === '/p/new.md')).toBeDefined()
  })

  it('returns next unchanged when prev is undefined', () => {
    const next: FileNode[] = [{ name: 'a.md', path: '/p/a.md', isDirectory: false }]
    expect(mergePreserveLoaded(undefined, next)).toBe(next)
  })
})

describe('setNodeChildren', () => {
  const tree: FileNode[] = [
    // `children` omitted = unloaded directory (the FileNode.children convention).
    // Written this way rather than `children: undefined` to satisfy
    // exactOptionalPropertyTypes; `.children` still reads as undefined.
    { name: 'sub', path: '/p/sub', isDirectory: true },
    { name: 'a.md', path: '/p/a.md', isDirectory: false },
  ]

  it('sets the children of the target node immutably', () => {
    const kids: FileNode[] = [{ name: 'x.md', path: '/p/sub/x.md', isDirectory: false }]
    const next = setNodeChildren(tree, '/p/sub', kids)
    expect(next).not.toBe(tree)
    expect(next.find((n) => n.path === '/p/sub')!.children).toEqual(kids)
    expect(tree.find((n) => n.path === '/p/sub')!.children).toBeUndefined()
  })

  it('returns the same tree reference when no node matches', () => {
    const next = setNodeChildren(tree, '/p/does-not-exist', [])
    expect(next).toBe(tree)
  })
})

describe('loadedDirPaths', () => {
  it('collects loaded directory paths in depth order', () => {
    const tree: FileNode[] = [
      {
        name: 'a',
        path: '/p/a',
        isDirectory: true,
        children: [
          { name: 'b', path: '/p/a/b', isDirectory: true, children: [] },
          // `children` omitted = unloaded (excluded from loadedDirPaths).
          { name: 'c', path: '/p/a/c', isDirectory: true },
        ],
      },
    ]
    expect(loadedDirPaths(tree)).toEqual(['/p/a', '/p/a/b'])
  })
})
