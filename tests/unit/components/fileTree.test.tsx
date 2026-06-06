/**
 * Tests for FileTree component.
 *
 * FileTree renders a recursive list of FileNode items, marks the active path,
 * and calls onSelect when a file row is clicked. Directories are expandable.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FileTree } from '../../../src/renderer/components/FileTree'
import type { FileNode } from '../../../src/shared/types'

afterEach(() => {
  cleanup()
})

const FLAT_NODES: FileNode[] = [
  { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
  { name: 'notes.md', path: '/p/notes.md', isDirectory: false },
]

const NESTED_NODES: FileNode[] = [
  {
    name: 'docs',
    path: '/p/docs',
    isDirectory: true,
    children: [
      { name: 'guide.md', path: '/p/docs/guide.md', isDirectory: false },
      { name: 'api.md', path: '/p/docs/api.md', isDirectory: false },
    ],
  },
  { name: 'readme.md', path: '/p/readme.md', isDirectory: false },
]

describe('FileTree', () => {
  it('renders a list of file nodes', () => {
    const { getByText } = render(
      <FileTree nodes={FLAT_NODES} activePath={null} onSelect={() => {}} />,
    )
    expect(getByText('readme.md')).toBeTruthy()
    expect(getByText('notes.md')).toBeTruthy()
  })

  it('renders the file-tree root class', () => {
    const { container } = render(
      <FileTree nodes={FLAT_NODES} activePath={null} onSelect={() => {}} />,
    )
    expect(container.querySelector('.file-tree')).not.toBeNull()
  })

  it('calls onSelect with the file path when a file is clicked', () => {
    const onSelect = vi.fn()
    const { getByText } = render(
      <FileTree nodes={FLAT_NODES} activePath={null} onSelect={onSelect} />,
    )
    fireEvent.click(getByText('readme.md'))
    expect(onSelect).toHaveBeenCalledWith('/p/readme.md')
  })

  it('applies active class to the row matching activePath', () => {
    const { getByText } = render(
      <FileTree
        nodes={FLAT_NODES}
        activePath="/p/readme.md"
        onSelect={() => {}}
      />,
    )
    const activeRow = getByText('readme.md').closest('.file-tree__row')
    expect(activeRow!.classList.contains('active')).toBe(true)
  })

  it('does not apply active class to non-active rows', () => {
    const { getByText } = render(
      <FileTree
        nodes={FLAT_NODES}
        activePath="/p/readme.md"
        onSelect={() => {}}
      />,
    )
    const notActiveRow = getByText('notes.md').closest('.file-tree__row')
    expect(notActiveRow!.classList.contains('active')).toBe(false)
  })

  it('renders directory nodes without calling onSelect when clicked', () => {
    const onSelect = vi.fn()
    const { getByText } = render(
      <FileTree nodes={NESTED_NODES} activePath={null} onSelect={onSelect} />,
    )
    fireEvent.click(getByText('docs'))
    // Directories expand, they don't call onSelect
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('children of a directory are hidden by default (collapsed)', () => {
    const { queryByText } = render(
      <FileTree nodes={NESTED_NODES} activePath={null} onSelect={() => {}} />,
    )
    // Children should not be visible before expanding
    expect(queryByText('guide.md')).toBeNull()
    expect(queryByText('api.md')).toBeNull()
  })

  it('expands a directory to reveal children when clicked', () => {
    const { getByText } = render(
      <FileTree nodes={NESTED_NODES} activePath={null} onSelect={() => {}} />,
    )
    // Click the directory to expand
    fireEvent.click(getByText('docs'))
    // Children should now be visible
    expect(getByText('guide.md')).toBeTruthy()
    expect(getByText('api.md')).toBeTruthy()
  })

  it('calls onSelect with child path after directory is expanded', () => {
    const onSelect = vi.fn()
    const { getByText } = render(
      <FileTree nodes={NESTED_NODES} activePath={null} onSelect={onSelect} />,
    )
    fireEvent.click(getByText('docs'))
    fireEvent.click(getByText('guide.md'))
    expect(onSelect).toHaveBeenCalledWith('/p/docs/guide.md')
  })

  it('collapses directory again when clicked a second time', () => {
    const { getByText, queryByText } = render(
      <FileTree nodes={NESTED_NODES} activePath={null} onSelect={() => {}} />,
    )
    // Expand
    fireEvent.click(getByText('docs'))
    expect(getByText('guide.md')).toBeTruthy()
    // Collapse
    fireEvent.click(getByText('docs'))
    expect(queryByText('guide.md')).toBeNull()
  })

  it('renders empty tree without errors', () => {
    const { container } = render(
      <FileTree nodes={[]} activePath={null} onSelect={() => {}} />,
    )
    expect(container.querySelector('.file-tree')).not.toBeNull()
  })

  it('auto-expands ancestor folders to reveal the active file', () => {
    // Active file lives inside the (default-collapsed) docs folder. Without any
    // click, the file row should be visible because its ancestor is auto-expanded.
    const { getByText } = render(
      <FileTree
        nodes={NESTED_NODES}
        activePath="/p/docs/guide.md"
        onSelect={() => {}}
      />,
    )
    expect(getByText('guide.md')).toBeTruthy()
  })

  it('marks the auto-revealed active file row as active', () => {
    const { getByText } = render(
      <FileTree
        nodes={NESTED_NODES}
        activePath="/p/docs/guide.md"
        onSelect={() => {}}
      />,
    )
    const row = getByText('guide.md').closest('.file-tree__row')
    expect(row?.className).toContain('active')
  })

})
