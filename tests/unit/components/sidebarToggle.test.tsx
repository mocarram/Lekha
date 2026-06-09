/**
 * Tests for SidebarToggle component.
 *
 * SidebarToggle is a single button pinned at the window's top-left. It reads
 * sidebarVisible from useWorkspaceStore, calls toggleSidebar() on click, and
 * swaps its icon + accessible label between the visible and hidden states.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { SidebarToggle } from '../../../src/renderer/components/SidebarToggle'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'

beforeEach(() => {
  useWorkspaceStore.setState({ sidebarVisible: true })
})

afterEach(() => {
  cleanup()
  useWorkspaceStore.setState({ sidebarVisible: true })
})

describe('SidebarToggle', () => {
  it('renders a button', () => {
    const { container } = render(<SidebarToggle />)
    expect(container.querySelector('button.sidebar-toggle')).not.toBeNull()
  })

  it('labels itself "Hide sidebar" and is pressed when the sidebar is visible', () => {
    useWorkspaceStore.setState({ sidebarVisible: true })
    const { getByRole } = render(<SidebarToggle />)
    const btn = getByRole('button', { name: 'Hide sidebar' })
    expect(btn.getAttribute('aria-pressed')).toBe('true')
  })

  it('labels itself "Show sidebar" and is not pressed when the sidebar is hidden', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { getByRole } = render(<SidebarToggle />)
    const btn = getByRole('button', { name: 'Show sidebar' })
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggles sidebarVisible from true to false on click', () => {
    useWorkspaceStore.setState({ sidebarVisible: true })
    const { getByRole } = render(<SidebarToggle />)
    fireEvent.click(getByRole('button'))
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
  })

  it('toggles sidebarVisible from false to true on click', () => {
    useWorkspaceStore.setState({ sidebarVisible: false })
    const { getByRole } = render(<SidebarToggle />)
    fireEvent.click(getByRole('button'))
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(true)
  })

  it('swaps the icon when visibility changes', () => {
    const { container, rerender } = render(<SidebarToggle />)
    expect(container.querySelector('[data-state="shown"]')).not.toBeNull()
    useWorkspaceStore.setState({ sidebarVisible: false })
    rerender(<SidebarToggle />)
    expect(container.querySelector('[data-state="hidden"]')).not.toBeNull()
  })
})
