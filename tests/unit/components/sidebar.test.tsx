/**
 * Tests for Sidebar component.
 *
 * Sidebar reads sidebarVisible and sidebarTab from useWorkspaceStore, renders
 * FileTree when tab='files' and Outline when tab='outline', and hides entirely
 * when sidebarVisible is false.
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

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState(WORKSPACE_DEFAULTS)
  useEditorStore.getState().reset()
})

beforeEach(() => {
  useWorkspaceStore.setState(WORKSPACE_DEFAULTS)
  useEditorStore.getState().reset()
})

describe('Sidebar', () => {
  const noop = () => {}

  it('renders the sidebar root element', () => {
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    expect(container.querySelector('.sidebar')).not.toBeNull()
  })

  it('is hidden entirely when sidebarVisible is false', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    expect(container.querySelector('.sidebar')).toBeNull()
  })

  it('shows FileTree when sidebarTab is "files"', () => {
    useWorkspaceStore.setState({ sidebarTab: 'files' })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    expect(container.querySelector('.file-tree')).not.toBeNull()
    expect(container.querySelector('.outline')).toBeNull()
  })

  it('shows Outline when sidebarTab is "outline"', () => {
    useWorkspaceStore.setState({ sidebarTab: 'outline' })
    const { container } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    expect(container.querySelector('.outline')).not.toBeNull()
    expect(container.querySelector('.file-tree')).toBeNull()
  })

  it('switches to "files" tab when the Files button is clicked', () => {
    useWorkspaceStore.setState({ sidebarTab: 'outline' })
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    fireEvent.click(getByText(/Files/i))
    expect(useWorkspaceStore.getState().sidebarTab).toBe('files')
  })

  it('switches to "outline" tab when the Outline button is clicked', () => {
    useWorkspaceStore.setState({ sidebarTab: 'files' })
    const { getByText } = render(
      <Sidebar onSelectFile={noop} onJumpToHeading={noop} />,
    )
    fireEvent.click(getByText(/Outline/i))
    expect(useWorkspaceStore.getState().sidebarTab).toBe('outline')
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
      <Sidebar onSelectFile={onSelect} onJumpToHeading={noop} />,
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
      <Sidebar onSelectFile={noop} onJumpToHeading={onJump} />,
    )
    fireEvent.click(getByText('Introduction'))
    expect(onJump).toHaveBeenCalledWith(0)
  })
})
