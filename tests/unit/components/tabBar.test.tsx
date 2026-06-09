/**
 * Tests for the TabBar component.
 *
 * TabBar reads open documents from documentsStore and forwards select/close/new
 * intent to the parent via callbacks. The strip is hidden when <= 1 doc is open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { TabBar } from '../../../src/renderer/components/TabBar'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'

const noop = () => undefined

afterEach(() => {
  cleanup()
  useDocumentsStore.getState().reset()
})
beforeEach(() => {
  useDocumentsStore.getState().reset()
})

/** Open `n` distinct file tabs and return their ids in order. */
function openTabs(n: number): string[] {
  const ids: string[] = []
  for (let i = 0; i < n; i++) {
    ids.push(
      useDocumentsStore
        .getState()
        .openDocument({ path: `/doc${i}.md`, markdown: `# Doc ${i}` }),
    )
  }
  return ids
}

describe('TabBar', () => {
  it('renders nothing when zero documents are open', () => {
    const { container } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders a single tab when one document is open (persistent tab strip)', () => {
    openTabs(1)
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(getAllByRole('tab')).toHaveLength(1)
  })

  it('renders one tab per open document when multiple are open', () => {
    openTabs(3)
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(getAllByRole('tab')).toHaveLength(3)
  })

  it('marks the active tab with aria-selected', () => {
    const ids = openTabs(2)
    useDocumentsStore.getState().activateDocument(ids[0]!)
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
  })

  it('calls onSelect with the tab id when a tab is clicked', () => {
    const ids = openTabs(2)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    fireEvent.click(getAllByRole('tab')[0]!)
    expect(onSelect).toHaveBeenCalledWith(ids[0])
  })

  it('calls onClose (not onSelect) when the close button is clicked', () => {
    const ids = openTabs(2)
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { getByRole } = render(
      <TabBar onSelect={onSelect} onClose={onClose} onNew={noop} />,
    )
    fireEvent.click(getByRole('button', { name: /Close doc0\.md/ }))
    expect(onClose).toHaveBeenCalledWith(ids[0])
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onClose on middle-click (auxclick) of a tab', () => {
    const ids = openTabs(2)
    const onClose = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={onClose} onNew={noop} />,
    )
    fireEvent(
      getAllByRole('tab')[1]!,
      new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }),
    )
    expect(onClose).toHaveBeenCalledWith(ids[1])
  })

  it('calls onNew when the + button is clicked', () => {
    openTabs(2)
    const onNew = vi.fn()
    const { getByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={onNew} />,
    )
    fireEvent.click(getByRole('button', { name: 'New document' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('gives only the active tab a tabindex of 0 (roving tabindex)', () => {
    const ids = openTabs(3)
    useDocumentsStore.getState().activateDocument(ids[1]!)
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs[0]!.getAttribute('tabindex')).toBe('-1')
    expect(tabs[1]!.getAttribute('tabindex')).toBe('0')
    expect(tabs[2]!.getAttribute('tabindex')).toBe('-1')
  })

  it('ArrowRight moves focus to the next tab and selects it', () => {
    const ids = openTabs(3)
    useDocumentsStore.getState().activateDocument(ids[0]!)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    tabs[0]!.focus()
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' })
    expect(onSelect).toHaveBeenCalledWith(ids[1])
    expect(document.activeElement).toBe(tabs[1])
  })

  it('ArrowLeft wraps from the first tab to the last', () => {
    const ids = openTabs(3)
    useDocumentsStore.getState().activateDocument(ids[0]!)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    tabs[0]!.focus()
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowLeft' })
    expect(onSelect).toHaveBeenCalledWith(ids[2])
    expect(document.activeElement).toBe(tabs[2])
  })

  it('Home/End jump to the first/last tab', () => {
    const ids = openTabs(3)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    tabs[1]!.focus()
    fireEvent.keyDown(tabs[1]!, { key: 'End' })
    expect(onSelect).toHaveBeenLastCalledWith(ids[2])
    tabs[2]!.focus()
    fireEvent.keyDown(tabs[2]!, { key: 'Home' })
    expect(onSelect).toHaveBeenLastCalledWith(ids[0])
  })

  it('Enter activates the focused tab', () => {
    const ids = openTabs(2)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    tabs[0]!.focus()
    fireEvent.keyDown(tabs[0]!, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(ids[0])
  })

  it('adds the tab--dirty class to dirty tabs', () => {
    const ids = openTabs(2)
    useDocumentsStore.getState().activateDocument(ids[1]!)
    useDocumentsStore.getState().updateActive({ isDirty: true })
    const { getAllByRole } = render(
      <TabBar onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs[1]!.classList.contains('tab--dirty')).toBe(true)
    expect(tabs[0]!.classList.contains('tab--dirty')).toBe(false)
  })
})
