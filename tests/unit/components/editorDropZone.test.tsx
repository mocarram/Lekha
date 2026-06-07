import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { EditorDropZone } from '@renderer/components/EditorDropZone'

beforeEach(() => {
  vi.stubGlobal('lekha', {
    getPathForFile: vi.fn((f: { name: string }) => `/dropped/${f.name}`),
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Fake DataTransfer carrying the given file/folder entries. */
function makeDataTransfer(
  entries: Array<{ name: string; type: string; isDirectory: boolean }>,
): DataTransfer {
  const items = entries.map((e) => ({
    kind: 'file',
    type: e.type,
    getAsFile: () => ({ name: e.name }) as unknown as File,
    webkitGetAsEntry: () => ({ isDirectory: e.isDirectory }),
  }))
  return {
    types: ['Files'],
    items: items as unknown as DataTransferItemList,
    files: [] as unknown as FileList,
    dropEffect: 'none',
  } as unknown as DataTransfer
}

function setup() {
  const onOpenFolder = vi.fn()
  const onOpenFiles = vi.fn()
  const onNotify = vi.fn()
  const { container } = render(
    <EditorDropZone onOpenFolder={onOpenFolder} onOpenFiles={onOpenFiles} onNotify={onNotify}>
      <div className="child">editor</div>
    </EditorDropZone>,
  )
  const area = container.querySelector('.editor-area') as HTMLElement
  return { area, onOpenFolder, onOpenFiles, onNotify }
}

describe('EditorDropZone', () => {
  it('opens a dropped folder as the workspace', () => {
    const { area, onOpenFolder, onOpenFiles } = setup()
    fireEvent.drop(area, {
      dataTransfer: makeDataTransfer([{ name: 'notes', type: '', isDirectory: true }]),
    })
    expect(onOpenFolder).toHaveBeenCalledWith('/dropped/notes')
    expect(onOpenFiles).not.toHaveBeenCalled()
  })

  it('opens dropped markdown and text files as tabs', () => {
    const { area, onOpenFiles } = setup()
    fireEvent.drop(area, {
      dataTransfer: makeDataTransfer([
        { name: 'a.md', type: 'text/markdown', isDirectory: false },
        { name: 'b.txt', type: 'text/plain', isDirectory: false },
      ]),
    })
    expect(onOpenFiles).toHaveBeenCalledWith(['/dropped/a.md', '/dropped/b.txt'])
  })

  it('notifies (not silent) when an unsupported file is dropped', () => {
    const { area, onOpenFiles, onNotify } = setup()
    fireEvent.drop(area, {
      dataTransfer: makeDataTransfer([{ name: 'doc.pdf', type: 'application/pdf', isDirectory: false }]),
    })
    expect(onOpenFiles).not.toHaveBeenCalled()
    expect(onNotify).toHaveBeenCalledWith(expect.stringContaining('doc.pdf'))
  })

  it('ignores an image-only drop (left for the editor to insert)', () => {
    const { area, onOpenFolder, onOpenFiles, onNotify } = setup()
    fireEvent.drop(area, {
      dataTransfer: makeDataTransfer([{ name: 'pic.png', type: 'image/png', isDirectory: false }]),
    })
    expect(onOpenFolder).not.toHaveBeenCalled()
    expect(onOpenFiles).not.toHaveBeenCalled()
    expect(onNotify).not.toHaveBeenCalled()
  })

  it('shows the drop overlay while dragging an open-type item over', () => {
    const { area } = setup()
    fireEvent.dragOver(area, {
      dataTransfer: makeDataTransfer([{ name: 'x.md', type: 'text/markdown', isDirectory: false }]),
    })
    expect(area.querySelector('.editor-drop-overlay')).not.toBeNull()
  })
})
