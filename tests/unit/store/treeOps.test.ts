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

  it('returns the filesystem root for a top-level path', () => {
    expect(parentDir('/a.md')).toBe('/')
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

  it('drops a previously-loaded subdir that is absent from the new listing', () => {
    const prev: FileNode[] = [
      { name: 'gone', path: '/p/gone', isDirectory: true, children: [
        { name: 'k.md', path: '/p/gone/k.md', isDirectory: false },
      ] },
    ]
    const next: FileNode[] = [{ name: 'kept.md', path: '/p/kept.md', isDirectory: false }]
    const merged = mergePreserveLoaded(prev, next)
    expect(merged.map((n) => n.path)).toEqual(['/p/kept.md'])
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

  it('patches a deeply-nested target, new refs only along the path', () => {
    const grandchild: FileNode = { name: 'inner', path: '/p/sub/inner', isDirectory: true, children: [] }
    const child: FileNode = { name: 'sub', path: '/p/sub', isDirectory: true, children: [grandchild] }
    const sibling: FileNode = { name: 'other', path: '/p/other', isDirectory: true, children: [] }
    const deepTree: FileNode[] = [child, sibling]

    const kids: FileNode[] = [{ name: 'x.md', path: '/p/sub/inner/x.md', isDirectory: false }]
    const next = setNodeChildren(deepTree, '/p/sub/inner', kids)

    expect(next).not.toBe(deepTree)
    expect(next[0]).not.toBe(child)       // path to target was re-created
    expect(next[1]).toBe(sibling)         // untouched sibling keeps identity
    expect(next[0]!.children![0]!.children).toEqual(kids)
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
