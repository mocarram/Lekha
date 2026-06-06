/**
 * Tests for Sidebar component.
 *
 * Sidebar reads sidebarVisible and sidebarTab from useWorkspaceStore, renders
 * FileTree when tab='files', Outline when tab='outline', FolderSearch when
 * tab='search', and hides entirely when sidebarVisible is false.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { Sidebar } from '../../../src/renderer/components/Sidebar'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

const WORKSPACE_DEFAULTS = {
  rootFolder: null,
  fileTree: [],
  recentFiles: [],
  sidebarVisible: true,
  sidebarTab: 'files' as const,
}

// Minimal stub so FolderSearch's window.lekha.searchFolder doesn't throw.
beforeEach(() => {
  vi.stubGlobal('lekha', {
    searchFolder: vi.fn(() => Promise.resolve([])),
  })
  useWorkspaceStore.setState(WORKSPACE_DEFAULTS)
  useEditorStore.getState().reset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useWorkspaceStore.setState(WORKSPACE_DEFAULTS)
  useEditorStore.getState().reset()
})

describe('Sidebar', () => {
  const noop = () => {}

  // File-tree operation callbacks the Sidebar requires but these tests don't
  // exercise. Bundled so each render passes them via spread.
  const fileOpProps = {
    onNewFile: noop,
    onNewFolder: noop,
    onRenameEntry: noop,
    onDeleteEntry: noop,
    onRevealEntry: noop,
    sidebarWidth: 240,
    onSidebarWidthChange: noop,
  }

  it('renders the sidebar root element', () => {
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    expect(container.querySelector('.sidebar')).not.toBeNull()
  })

  it('is hidden entirely when sidebarVisible is false', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    expect(container.querySelector('.sidebar')).toBeNull()
  })

  it('shows FileTree when sidebarTab is "files"', () => {
    useWorkspaceStore.setState({ sidebarTab: 'files' })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    expect(container.querySelector('.file-tree')).not.toBeNull()
    expect(container.querySelector('.outline')).toBeNull()
  })

  it('shows Outline when sidebarTab is "outline"', () => {
    useWorkspaceStore.setState({ sidebarTab: 'outline' })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    expect(container.querySelector('.outline')).not.toBeNull()
    expect(container.querySelector('.file-tree')).toBeNull()
  })

  it('shows FolderSearch when sidebarTab is "search"', () => {
    useWorkspaceStore.setState({ sidebarTab: 'search' })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    expect(container.querySelector('.folder-search')).not.toBeNull()
    expect(container.querySelector('.file-tree')).toBeNull()
    expect(container.querySelector('.outline')).toBeNull()
  })

  it('switches to "files" tab when the Files button is clicked', () => {
    useWorkspaceStore.setState({ sidebarTab: 'outline' })
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    fireEvent.click(getByText(/Files/i))
    expect(useWorkspaceStore.getState().sidebarTab).toBe('files')
  })

  it('switches to "outline" tab when the Outline button is clicked', () => {
    useWorkspaceStore.setState({ sidebarTab: 'files' })
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    fireEvent.click(getByText(/Outline/i))
    expect(useWorkspaceStore.getState().sidebarTab).toBe('outline')
  })

  it('switches to "search" tab when the Search button is clicked', () => {
    useWorkspaceStore.setState({ sidebarTab: 'files' })
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    fireEvent.click(getByText(/Search/i))
    expect(useWorkspaceStore.getState().sidebarTab).toBe('search')
  })

  it('calls onSelectFile when a file is selected from FileTree', () => {
    const onSelect = vi.fn()
    useWorkspaceStore.setState({
      sidebarTab: 'files',
      fileTree: [
        { name: 'notes.md', path: '/docs/notes.md', isDirectory: false },
      ],
    })
    const { getByText } = render(
      <Sidebar onSelectFile={onSelect} onJumpToHeading={noop} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    fireEvent.click(getByText('notes.md'))
    expect(onSelect).toHaveBeenCalledWith('/docs/notes.md')
  })

  it('calls onJumpToHeading when an outline item is clicked', () => {
    const onJump = vi.fn()
    useWorkspaceStore.setState({ sidebarTab: 'outline' })
    useEditorStore.getState().setOutline([
      { level: 1, text: 'Introduction', pos: 0 },
    ])
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={onJump} onOpenSearchResult={noop} {...fileOpProps} />,
    )
    fireEvent.click(getByText('Introduction'))
    expect(onJump).toHaveBeenCalledWith(0)
  })
})
