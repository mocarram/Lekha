/**
 * Unit tests for the imagePaste editor props.
 *
 * Tests verify:
 *  - handlePaste: detects image clipboard items, calls window.lekha.saveImage,
 *    inserts an image node at the cursor position.
 *  - handleDrop: detects image files in the dataTransfer, calls saveImage,
 *    inserts at the resolved drop position.
 *  - Non-image events return false (no handling).
 *  - Multiple images are inserted in order, each at the correct offset.
 *
 * happy-dom does not implement DataTransferItem / File fully, so we build
 * minimal typed stubs that satisfy the interfaces we consume.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from '@testing-library/react'
import type { EditorView as ProseMirrorEditorView } from 'prosemirror-view'
import { imageEditorProps } from '../../../src/renderer/editor/imagePaste'
import type { LekhaAPI } from '../../../src/preload/api'
import type { FileNode } from '../../../src/shared/types'

// ---------------------------------------------------------------------------
// Typed stubs for clipboard / dataTransfer items (no `any`)
// ---------------------------------------------------------------------------

interface FakeFile {
  type: string
  arrayBuffer(): Promise<ArrayBuffer>
}

function makeImageFile(mime: string, bytes: number[] = [0xff, 0xd8]): FakeFile {
  const ab = new ArrayBuffer(bytes.length)
  const view = new Uint8Array(ab)
  view.set(bytes)
  return {
    type: mime,
    arrayBuffer: () => Promise.resolve(ab),
  }
}

/** A minimal DataTransferItemList-like object (kind=file, getAsFile() returns FakeFile). */
function makeDTItemList(files: FakeFile[]): DataTransferItemList {
  const items = files.map((f) => ({
    kind: 'file' as const,
    type: f.type,
    getAsFile: () => f as unknown as File,
  }))
  return {
    length: items.length,
    [Symbol.iterator]: items[Symbol.iterator].bind(items),
    item: (i: number) => items[i] as unknown as DataTransferItem,
    add: () => null,
    clear: () => undefined,
    remove: () => undefined,
    ...Object.fromEntries(items.map((v, i) => [i, v as unknown as DataTransferItem])),
  } as unknown as DataTransferItemList
}

/** Build a fake ClipboardEvent with the given image items. */
function makeClipboardEvent(files: FakeFile[]): ClipboardEvent {
  return {
    clipboardData: {
      items: makeDTItemList(files),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent
}

/** A minimal FileList from an array of FakeFile. */
function makeFileList(files: FakeFile[]): FileList {
  const obj = {
    length: files.length,
    item: (i: number) => files[i] as unknown as File,
    [Symbol.iterator]: function* () { yield* files as unknown as File[] },
    ...Object.fromEntries(files.map((f, i) => [i, f as unknown as File])),
  }
  return obj as unknown as FileList
}

/** Build a fake DragEvent with the given files. */
function makeDragEvent(
  files: FakeFile[],
  clientX = 0,
  clientY = 0,
): DragEvent {
  return {
    dataTransfer: { files: makeFileList(files) },
    clientX,
    clientY,
    preventDefault: vi.fn(),
  } as unknown as DragEvent
}

// ---------------------------------------------------------------------------
// LekhaAPI mock
// ---------------------------------------------------------------------------

function makeMockLekha(
  saveImage: LekhaAPI['saveImage'] = vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' })),
): LekhaAPI {
  return {
    openFileDialog: vi.fn(() => Promise.resolve(null as string | null)),
    openFolderDialog: vi.fn(() => Promise.resolve(null as string | null)),
    saveAsDialog: vi.fn(() => Promise.resolve(null as string | null)),
    confirmUnsaved: vi.fn(() => Promise.resolve('cancel' as const)),
    readFile: vi.fn((_p: string) => Promise.resolve('')),
    statFile: vi.fn(() => Promise.resolve({ sizeBytes: 0, birthtimeMs: 0, mtimeMs: 0 })),
    writeFile: vi.fn(() => Promise.resolve()),
    readDir: vi.fn(() => Promise.resolve([] as FileNode[])),
    listArticles: vi.fn(() => Promise.resolve([])),
    createFile: vi.fn(() => Promise.resolve('')),
    createFolder: vi.fn(() => Promise.resolve('')),
    renamePath: vi.fn(() => Promise.resolve('')),
    duplicatePath: vi.fn(() => Promise.resolve('')),
    movePath: vi.fn(() => Promise.resolve('')),
    deletePath: vi.fn(() => Promise.resolve()),
    revealPath: vi.fn(() => Promise.resolve()),
    getSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
        theme: 'github',
        focusMode: false,
        typewriterMode: false,
        equationNumbering: true,
        fontSize: 16,
        autoSave: true,
        spellCheck: true,
        spellCheckLanguage: 'en-US',
        smartPunctuation: true,
        sidebarWidth: 240,
        openTabPaths: [],
        activeTabPath: null,
      }),
    ),
    setSettings: vi.fn(() =>
      Promise.resolve({
        recentFiles: [] as string[],
        lastFolder: null,
        sidebarVisible: true,
        sidebarTab: 'files' as const,
        theme: 'github',
        focusMode: false,
        typewriterMode: false,
        equationNumbering: true,
        fontSize: 16,
        autoSave: true,
        spellCheck: true,
        spellCheckLanguage: 'en-US',
        smartPunctuation: true,
        sidebarWidth: 240,
        openTabPaths: [],
        activeTabPath: null,
      }),
    ),
    getRecentFiles: vi.fn(() => Promise.resolve([] as string[])),
    addRecentFile: vi.fn(() => Promise.resolve()),
    setDocumentState: vi.fn(),
    newWindow: vi.fn(),
    print: vi.fn(),
    share: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    onCommand: vi.fn(() => () => undefined),
    onOpenPath: vi.fn(() => () => undefined),
    onSetTheme: vi.fn(() => () => undefined),
    exportHtml: vi.fn(() => Promise.resolve()),
    exportPdf: vi.fn(() => Promise.resolve()),
    exportPandoc: vi.fn(() => Promise.resolve()),
    pandocAvailable: vi.fn(() => Promise.resolve(false)),
    saveImage,
    openExternal: vi.fn(() => Promise.resolve()),
    writeClipboard: vi.fn(() => Promise.resolve()),
    readClipboardText: vi.fn(() => Promise.resolve('')),
    searchFolder: vi.fn(() => Promise.resolve([])),
    listTemplates: vi.fn(() => Promise.resolve([])),
    listThemes: vi.fn(() => Promise.resolve([])),
    reloadThemes: vi.fn(() => Promise.resolve([])),
    openThemeFolder: vi.fn(() => Promise.resolve()),
  }
}

// ---------------------------------------------------------------------------
// Fake ProseMirror view factory
// ---------------------------------------------------------------------------

interface FakeView {
  state: {
    selection: { from: number }
    doc: { content: { size: number } }
    tr: { insert: ReturnType<typeof vi.fn> }
  }
  dispatch: ReturnType<typeof vi.fn>
  isDestroyed: boolean
  posAtCoords?: ReturnType<typeof vi.fn>
}

function makeFakeView(fromPos = 0): FakeView {
  return {
    state: {
      selection: { from: fromPos },
      doc: { content: { size: 100 } },
      tr: { insert: vi.fn().mockReturnThis() },
    },
    dispatch: vi.fn(),
    isDestroyed: false,
    posAtCoords: vi.fn(() => ({ pos: fromPos })),
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// imageEditorProps - handlePaste
// ---------------------------------------------------------------------------

describe('imageEditorProps - handlePaste', () => {
  it('returns false when there are no image items in the clipboard', () => {
    vi.stubGlobal('lekha', makeMockLekha())
    const props = imageEditorProps(() => '/docs/test.md')

    const fakeView = makeFakeView()
    const event = makeClipboardEvent([]) // no images
    const handled = props.handlePaste(fakeView as unknown as ProseMirrorEditorView, event)
    expect(handled).toBe(false)
  })

  it('returns true and calls saveImage when an image item is in the clipboard', async () => {
    const saveImage = vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' }))
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => '/docs/test.md')

    const dispatch = vi.fn()
    const trInsert = vi.fn().mockReturnThis()
    const fakeView = {
      state: {
        selection: { from: 5 },
        doc: { content: { size: 100 } },
        tr: { insert: trInsert },
      },
      dispatch,
      isDestroyed: false,
      posAtCoords: vi.fn(() => ({ pos: 5 })),
    }

    const file = makeImageFile('image/png')
    const event = makeClipboardEvent([file])

    const handled = props.handlePaste(
      fakeView as unknown as ProseMirrorEditorView,
      event,
    )

    // Should return true synchronously (handled)
    expect(handled).toBe(true)

    // Await microtasks so the async processImages settles
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveImage).toHaveBeenCalledOnce()
    expect(saveImage).toHaveBeenCalledWith({
      data: expect.any(ArrayBuffer),
      ext: 'png',
      docPath: '/docs/test.md',
    })

    // dispatch should have been called to insert the image node
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('passes docPath=null for unsaved documents', async () => {
    const saveImage = vi.fn(() => Promise.resolve({ insertPath: 'file:///userData/images/image-000001.png' }))
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => null) // unsaved doc

    const fakeView = {
      state: {
        selection: { from: 0 },
        doc: { content: { size: 100 } },
        tr: { insert: vi.fn().mockReturnThis() },
      },
      dispatch: vi.fn(),
      isDestroyed: false,
    }

    const event = makeClipboardEvent([makeImageFile('image/jpeg')])
    props.handlePaste(fakeView as unknown as ProseMirrorEditorView, event)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveImage).toHaveBeenCalledWith(
      expect.objectContaining({ docPath: null }),
    )
  })

  it('inserts the image node with the src returned by saveImage', async () => {
    const insertPath = 'assets/my-special-image.png'
    const saveImage = vi.fn(() => Promise.resolve({ insertPath }))
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => '/docs/test.md')

    const dispatch = vi.fn()
    const trInsert = vi.fn().mockReturnThis()
    const fakeView = {
      state: {
        selection: { from: 0 },
        doc: { content: { size: 100 } },
        tr: { insert: trInsert },
      },
      dispatch,
      isDestroyed: false,
    }

    const event = makeClipboardEvent([makeImageFile('image/png')])
    props.handlePaste(fakeView as unknown as ProseMirrorEditorView, event)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // trInsert should have been called with pos=0 and an image node
    expect(trInsert).toHaveBeenCalledOnce()
    const [pos, node] = trInsert.mock.calls[0] as [number, { type: { name: string }; attrs: { src: string } }]
    expect(pos).toBe(0)
    expect(node.type.name).toBe('image')
    expect(node.attrs.src).toBe(insertPath)
  })
})

// ---------------------------------------------------------------------------
// imageEditorProps - handleDrop
// ---------------------------------------------------------------------------

describe('imageEditorProps - handleDrop', () => {
  it('returns false when there are no image files in the drop', () => {
    vi.stubGlobal('lekha', makeMockLekha())
    const props = imageEditorProps(() => '/docs/test.md')

    const fakeView = {
      state: {
        selection: { from: 0 },
        doc: { content: { size: 100 } },
        tr: { insert: vi.fn().mockReturnThis() },
      },
      dispatch: vi.fn(),
      isDestroyed: false,
      posAtCoords: vi.fn(() => ({ pos: 0 })),
    }

    const event = makeDragEvent([]) // no image files
    const handled = props.handleDrop(
      fakeView as unknown as ProseMirrorEditorView,
      event,
    )
    expect(handled).toBe(false)
  })

  it('returns true and calls saveImage when image files are dropped', async () => {
    const saveImage = vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' }))
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => '/docs/test.md')

    const dispatch = vi.fn()
    const trInsert = vi.fn().mockReturnThis()
    const fakeView = {
      state: {
        selection: { from: 0 },
        doc: { content: { size: 100 } },
        tr: { insert: trInsert },
      },
      dispatch,
      isDestroyed: false,
      posAtCoords: vi.fn(() => ({ pos: 10 })),
    }

    const event = makeDragEvent([makeImageFile('image/gif')], 50, 100)
    const handled = props.handleDrop(
      fakeView as unknown as ProseMirrorEditorView,
      event,
    )
    expect(handled).toBe(true)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveImage).toHaveBeenCalledOnce()
    expect(saveImage).toHaveBeenCalledWith(
      expect.objectContaining({ ext: 'gif', docPath: '/docs/test.md' }),
    )
    expect(dispatch).toHaveBeenCalledOnce()
  })

  it('uses posAtCoords for the insertion position', async () => {
    const saveImage = vi.fn(() => Promise.resolve({ insertPath: 'assets/image-000001.png' }))
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => '/docs/test.md')

    const trInsert = vi.fn().mockReturnThis()
    const posAtCoords = vi.fn(() => ({ pos: 42 }))
    const fakeView = {
      state: {
        selection: { from: 0 },
        doc: { content: { size: 200 } },
        tr: { insert: trInsert },
      },
      dispatch: vi.fn(),
      isDestroyed: false,
      posAtCoords,
    }

    const event = makeDragEvent([makeImageFile('image/webp')], 200, 300)
    props.handleDrop(fakeView as unknown as ProseMirrorEditorView, event)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(posAtCoords).toHaveBeenCalledWith({ left: 200, top: 300 })
    const [pos] = trInsert.mock.calls[0] as [number]
    expect(pos).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Multiple images
// ---------------------------------------------------------------------------

describe('imageEditorProps - multiple images', () => {
  it('inserts multiple images at sequential offsets', async () => {
    let callN = 0
    const saveImage = vi.fn(() => {
      callN++
      return Promise.resolve({ insertPath: `assets/image-00000${callN}.png` })
    })
    vi.stubGlobal('lekha', makeMockLekha(saveImage))

    const props = imageEditorProps(() => '/docs/test.md')

    const dispatch = vi.fn()
    const trInsert = vi.fn().mockReturnThis()
    const fakeView = {
      state: {
        selection: { from: 5 },
        doc: { content: { size: 100 } },
        tr: { insert: trInsert },
      },
      dispatch,
      isDestroyed: false,
    }

    const files = [makeImageFile('image/png'), makeImageFile('image/jpeg')]
    const event = makeClipboardEvent(files)
    props.handlePaste(fakeView as unknown as ProseMirrorEditorView, event)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(saveImage).toHaveBeenCalledTimes(2)
    expect(dispatch).toHaveBeenCalledTimes(2)

    const pos0 = (trInsert.mock.calls[0] as [number])[0]
    const pos1 = (trInsert.mock.calls[1] as [number])[0]
    // Second image should be inserted 1 position after the first
    expect(pos1).toBe(pos0 + 1)
  })
})
