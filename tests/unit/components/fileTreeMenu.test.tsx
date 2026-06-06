/**
 * Tests for FileTreeMenu - the positioned right-click context menu for the
 * file tree, and the FileTree's context-menu / inline-rename integration.
 *
 * FileTreeMenu renders a small popup of action buttons appropriate to the
 * target kind (file / folder / root). Clicking an action invokes the matching
 * callback. Esc closes the menu.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FileTreeMenu, type FileTreeMenuTarget } from '../../../src/renderer/components/FileTreeMenu'
import { FileTree } from '../../../src/renderer/components/FileTree'
import type { FileNode } from '../../../src/shared/types'

afterEach(() => {
  cleanup()
})

const FILE_TARGET: FileTreeMenuTarget = {
  kind: 'file',
  node: { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
}

const FOLDER_TARGET: FileTreeMenuTarget = {
  kind: 'folder',
  node: { name: 'docs', path: '/p/docs', isDirectory: true, children: [] },
}

const ROOT_TARGET: FileTreeMenuTarget = { kind: 'root', node: null }

function noopActions() {
  return {
    onNewFile: vi.fn(),
    onNewFolder: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onReveal: vi.fn(),
    onClose: vi.fn(),
  }
}

describe('FileTreeMenu', () => {
  it('on a FILE shows Rename, Delete, Reveal but not New File/New Folder', () => {
    const a = noopActions()
    const { getByText, queryByText } = render(
      <FileTreeMenu target={FILE_TARGET} x={10} y={10} {...a} />,
    )
    expect(getByText('Rename')).toBeTruthy()
    expect(getByText('Delete')).toBeTruthy()
    expect(getByText('Reveal in Finder')).toBeTruthy()
    expect(queryByText('New File')).toBeNull()
    expect(queryByText('New Folder')).toBeNull()
  })

  it('on a FOLDER shows New File, New Folder, Rename, Delete, Reveal', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={FOLDER_TARGET} x={0} y={0} {...a} />,
    )
    expect(getByText('New File')).toBeTruthy()
    expect(getByText('New Folder')).toBeTruthy()
    expect(getByText('Rename')).toBeTruthy()
    expect(getByText('Delete')).toBeTruthy()
    expect(getByText('Reveal in Finder')).toBeTruthy()
  })

  it('on ROOT shows only New File and New Folder', () => {
    const a = noopActions()
    const { getByText, queryByText } = render(
      <FileTreeMenu target={ROOT_TARGET} x={0} y={0} {...a} />,
    )
    expect(getByText('New File')).toBeTruthy()
    expect(getByText('New Folder')).toBeTruthy()
    expect(queryByText('Rename')).toBeNull()
    expect(queryByText('Delete')).toBeNull()
  })

  it('clicking Rename calls onRename with the target node', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={FILE_TARGET} x={0} y={0} {...a} />,
    )
    fireEvent.click(getByText('Rename'))
    expect(a.onRename).toHaveBeenCalledWith(FILE_TARGET.node)
  })

  it('clicking Delete calls onDelete with the target node', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={FILE_TARGET} x={0} y={0} {...a} />,
    )
    fireEvent.click(getByText('Delete'))
    expect(a.onDelete).toHaveBeenCalledWith(FILE_TARGET.node)
  })

  it('clicking Reveal in Finder calls onReveal with the target path', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={FILE_TARGET} x={0} y={0} {...a} />,
    )
    fireEvent.click(getByText('Reveal in Finder'))
    expect(a.onReveal).toHaveBeenCalledWith('/p/readme.md')
  })

  it('clicking New File on a folder calls onNewFile with the folder dir', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={FOLDER_TARGET} x={0} y={0} {...a} />,
    )
    fireEvent.click(getByText('New File'))
    expect(a.onNewFile).toHaveBeenCalledWith('/p/docs')
  })

  it('clicking New Folder on root calls onNewFolder with null (root dir)', () => {
    const a = noopActions()
    const { getByText } = render(
      <FileTreeMenu target={ROOT_TARGET} x={0} y={0} {...a} />,
    )
    fireEvent.click(getByText('New Folder'))
    expect(a.onNewFolder).toHaveBeenCalledWith(null)
  })

  it('pressing Escape calls onClose', () => {
    const a = noopActions()
    render(<FileTreeMenu target={FILE_TARGET} x={0} y={0} {...a} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(a.onClose).toHaveBeenCalled()
  })

  it('is positioned at the given x/y', () => {
    const a = noopActions()
    const { container } = render(
      <FileTreeMenu target={FILE_TARGET} x={42} y={99} {...a} />,
    )
    const menu = container.querySelector('.filetree-menu') as HTMLElement
    expect(menu).not.toBeNull()
    expect(menu.style.left).toBe('42px')
    expect(menu.style.top).toBe('99px')
  })
})

// ---------------------------------------------------------------------------
// FileTree integration: context menu + inline rename
// ---------------------------------------------------------------------------

const NODES: FileNode[] = [
  { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
  {
    name: 'docs',
    path: '/p/docs',
    isDirectory: true,
    children: [{ name: 'guide.md', path: '/p/docs/guide.md', isDirectory: false }],
  },
]

describe('FileTree context menu', () => {
  it('right-clicking a file opens the menu with file actions', () => {
    const { getByText, queryByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} />,
    )
    fireEvent.contextMenu(getByText('readme.md'))
    expect(getByText('Rename')).toBeTruthy()
    expect(getByText('Delete')).toBeTruthy()
    expect(queryByText('New File')).toBeNull()
  })

  it('right-clicking a folder opens the menu with folder actions', () => {
    const { getByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} />,
    )
    fireEvent.contextMenu(getByText('docs'))
    expect(getByText('New File')).toBeTruthy()
    expect(getByText('New Folder')).toBeTruthy()
    expect(getByText('Rename')).toBeTruthy()
  })

  it('clicking Rename turns the row into an input that commits on Enter', () => {
    const onRename = vi.fn(() => Promise.resolve())
    const { getByText, getByDisplayValue } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} onRename={onRename} />,
    )
    fireEvent.contextMenu(getByText('readme.md'))
    fireEvent.click(getByText('Rename'))
    const input = getByDisplayValue('readme.md') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'notes.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('/p/readme.md', 'notes.md')
  })

  it('inline rename cancels on Escape without calling onRename', () => {
    const onRename = vi.fn(() => Promise.resolve())
    const { getByText, getByDisplayValue, queryByDisplayValue } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} onRename={onRename} />,
    )
    fireEvent.contextMenu(getByText('readme.md'))
    fireEvent.click(getByText('Rename'))
    const input = getByDisplayValue('readme.md') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'x.md' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(queryByDisplayValue('x.md')).toBeNull()
  })

  it('clicking Reveal in Finder calls onReveal with the file path', () => {
    const onReveal = vi.fn()
    const { getByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} onReveal={onReveal} />,
    )
    fireEvent.contextMenu(getByText('readme.md'))
    fireEvent.click(getByText('Reveal in Finder'))
    expect(onReveal).toHaveBeenCalledWith('/p/readme.md')
  })

  it('clicking Delete calls onDelete with the file path', () => {
    const onDelete = vi.fn(() => Promise.resolve())
    const { getByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} onDelete={onDelete} />,
    )
    fireEvent.contextMenu(getByText('readme.md'))
    fireEvent.click(getByText('Delete'))
    expect(onDelete).toHaveBeenCalledWith('/p/readme.md')
  })

  it('right-clicking the empty tree area opens the root menu (New File/Folder)', () => {
    const { container, getByText, queryByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} />,
    )
    const root = container.querySelector('.file-tree') as HTMLElement
    fireEvent.contextMenu(root)
    expect(getByText('New File')).toBeTruthy()
    expect(getByText('New Folder')).toBeTruthy()
    expect(queryByText('Rename')).toBeNull()
  })

  it('clicking New File on a folder calls onNewFile with the folder path', () => {
    const onNewFile = vi.fn(() => Promise.resolve())
    const { getByText } = render(
      <FileTree nodes={NODES} activePath={null} onSelect={() => {}} onNewFile={onNewFile} />,
    )
    fireEvent.contextMenu(getByText('docs'))
    fireEvent.click(getByText('New File'))
    expect(onNewFile).toHaveBeenCalledWith('/p/docs')
  })
})
