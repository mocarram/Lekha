import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  classifyDrop,
  dragHasFiles,
  dragIsOpenType,
  dragMaybeFolder,
  openableFiles,
} from '@renderer/components/sidebarDrop'

// classifyDrop reads window.lekha.getPathForFile to resolve absolute paths.
beforeEach(() => {
  vi.stubGlobal('lekha', {
    getPathForFile: vi.fn((f: { name: string }) => `/dropped/${f.name}`),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Build a fake DataTransfer with items carrying webkitGetAsEntry + getAsFile. */
function makeDataTransfer(
  entries: Array<{ name: string; isDirectory: boolean }>,
): DataTransfer {
  const items = entries.map((e) => ({
    kind: 'file',
    getAsFile: () => ({ name: e.name }) as unknown as File,
    webkitGetAsEntry: () => ({ isDirectory: e.isDirectory }),
  }))
  return {
    types: ['Files'],
    items: items as unknown as DataTransferItemList,
    files: [] as unknown as FileList,
  } as unknown as DataTransfer
}

describe('classifyDrop', () => {
  it('splits dropped entries into folder and file paths', () => {
    const dt = makeDataTransfer([
      { name: 'notes', isDirectory: true },
      { name: 'a.md', isDirectory: false },
      { name: 'b.md', isDirectory: false },
    ])
    const { folders, files } = classifyDrop(dt)
    expect(folders).toEqual(['/dropped/notes'])
    expect(files).toEqual(['/dropped/a.md', '/dropped/b.md'])
  })

  it('ignores non-file items and unresolved paths', () => {
    const dt = {
      types: ['Files'],
      items: [
        { kind: 'string', getAsFile: () => null, webkitGetAsEntry: () => null },
      ] as unknown as DataTransferItemList,
      files: [] as unknown as FileList,
    } as unknown as DataTransfer
    expect(classifyDrop(dt)).toEqual({ folders: [], files: [] })
  })

  it('returns empty for a null DataTransfer', () => {
    expect(classifyDrop(null)).toEqual({ folders: [], files: [] })
  })
})

describe('dragHasFiles', () => {
  it('is true only when the drag carries OS files', () => {
    expect(dragHasFiles({ types: ['Files'] } as unknown as DataTransfer)).toBe(true)
    expect(dragHasFiles({ types: ['text/plain'] } as unknown as DataTransfer)).toBe(false)
    expect(dragHasFiles(null)).toBe(false)
  })
})

describe('dragIsOpenType', () => {
  function dt(types: string[], itemTypes: string[]): DataTransfer {
    return {
      types,
      items: itemTypes.map((t) => ({ kind: 'file', type: t })) as unknown as DataTransferItemList,
    } as unknown as DataTransfer
  }
  it('is true for a non-image file (markdown) or a folder (empty type)', () => {
    expect(dragIsOpenType(dt(['Files'], ['text/markdown']))).toBe(true)
    expect(dragIsOpenType(dt(['Files'], ['']))).toBe(true) // folder
  })
  it('is false for an image-only drag', () => {
    expect(dragIsOpenType(dt(['Files'], ['image/png']))).toBe(false)
  })
  it('is false when no files are dragged', () => {
    expect(dragIsOpenType(dt(['text/plain'], []))).toBe(false)
    expect(dragIsOpenType(null)).toBe(false)
  })
})

describe('dragMaybeFolder', () => {
  function dt(itemTypes: string[]): DataTransfer {
    return {
      types: ['Files'],
      items: itemTypes.map((t) => ({ kind: 'file', type: t })) as unknown as DataTransferItemList,
    } as unknown as DataTransfer
  }
  it('is true when every item has an empty MIME type (possible folder)', () => {
    expect(dragMaybeFolder(dt([''])).valueOf()).toBe(true)
  })
  it('is false when any item has a real MIME type (definitely a file)', () => {
    expect(dragMaybeFolder(dt(['application/pdf']))).toBe(false)
    expect(dragMaybeFolder(dt(['', 'image/png']))).toBe(false)
  })
})

describe('openableFiles', () => {
  it('keeps markdown and plain-text files, drops binaries', () => {
    expect(
      openableFiles(['/x/a.md', '/x/b.txt', '/x/c.markdown', '/x/d.png', '/x/e.pdf', '/x/f.mdx']),
    ).toEqual(['/x/a.md', '/x/b.txt', '/x/c.markdown', '/x/f.mdx'])
  })
})
