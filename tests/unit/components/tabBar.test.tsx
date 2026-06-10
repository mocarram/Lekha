/**
 * Tests for the TabBar component.
 *
 * TabBar reads open documents from documentsStore and forwards select/close/new
 * intent to the parent via callbacks. The strip is a persistent shell element:
 * it always renders (even with zero or one document open) so the layout never
 * shifts and the new-tab button is always available.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, createEvent, act } from '@testing-library/react'
import { TabBar } from '../../../src/renderer/components/TabBar'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'

const noop = () => undefined

// Context-menu callbacks most tests don't exercise, spread into every render.
const menuNoop = {
  onCloseOthers: noop,
  onCloseRight: noop,
  onCloseSaved: noop,
  onCloseAll: noop,
  onCopyPath: noop,
  onReveal: noop,
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
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
  it('renders the persistent strip (new-tab button, no tabs) when zero documents are open', () => {
    const { container, getByLabelText, queryAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(container.querySelector('.tab-bar')).not.toBeNull()
    expect(queryAllByRole('tab')).toHaveLength(0)
    expect(getByLabelText('New document')).toBeTruthy()
  })

  it('renders a single tab when one document is open (persistent tab strip)', () => {
    openTabs(1)
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(getAllByRole('tab')).toHaveLength(1)
  })

  it('renders one tab per open document when multiple are open', () => {
    openTabs(3)
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    expect(getAllByRole('tab')).toHaveLength(3)
  })

  it('marks the active tab with aria-selected', () => {
    const ids = openTabs(2)
    useDocumentsStore.getState().activateDocument(ids[0]!)
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('false')
  })

  it('calls onSelect with the tab id when a tab is clicked', () => {
    const ids = openTabs(2)
    const onSelect = vi.fn()
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={onSelect} onClose={noop} onNew={noop} />,
    )
    fireEvent.click(getAllByRole('tab')[0]!)
    expect(onSelect).toHaveBeenCalledWith(ids[0])
  })

  it('calls onClose (not onSelect) when the close button is clicked', () => {
    const ids = openTabs(2)
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const { getByRole } = render(
      <TabBar {...menuNoop} onSelect={onSelect} onClose={onClose} onNew={noop} />,
    )
    fireEvent.click(getByRole('button', { name: /Close doc0\.md/ }))
    expect(onClose).toHaveBeenCalledWith(ids[0])
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('calls onClose on middle-click (auxclick) of a tab', () => {
    const ids = openTabs(2)
    const onClose = vi.fn()
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={onClose} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={onNew} />,
    )
    fireEvent.click(getByRole('button', { name: 'New document' }))
    expect(onNew).toHaveBeenCalledOnce()
  })

  it('gives only the active tab a tabindex of 0 (roving tabindex)', () => {
    const ids = openTabs(3)
    useDocumentsStore.getState().activateDocument(ids[1]!)
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={onSelect} onClose={noop} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={onSelect} onClose={noop} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={onSelect} onClose={noop} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={onSelect} onClose={noop} onNew={noop} />,
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
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    expect(tabs[1]!.classList.contains('tab--dirty')).toBe(true)
    expect(tabs[0]!.classList.contains('tab--dirty')).toBe(false)
  })
})

/**
 * Scrolling: with many tabs the strip overflows horizontally (tabs keep a
 * minimum width instead of squashing). A vertical mouse wheel translates to
 * horizontal scrolling (VS Code behavior) and the ACTIVE tab is auto-scrolled
 * into view on activation. happy-dom computes no layout, so overflow metrics
 * are stubbed and scrollIntoView is spied on the prototype.
 */

/** Pretend the strip overflows (happy-dom computes no layout). */
function stubOverflow(el: Element, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

describe('TabBar - wheel scrolling', () => {
  it('translates a vertical mouse wheel into horizontal strip scrolling', () => {
    openTabs(3)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const strip = container.querySelector('.tab-bar__tabs')!
    stubOverflow(strip, 800, 200)

    fireEvent.wheel(strip, { deltaY: 60, deltaX: 0 })
    expect(strip.scrollLeft).toBe(60)
    fireEvent.wheel(strip, { deltaY: -30, deltaX: 0 })
    expect(strip.scrollLeft).toBe(30)
  })

  it('leaves trackpad horizontal pans (deltaX dominant) to native scrolling', () => {
    openTabs(3)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const strip = container.querySelector('.tab-bar__tabs')!
    stubOverflow(strip, 800, 200)

    fireEvent.wheel(strip, { deltaY: 5, deltaX: 40 })
    expect(strip.scrollLeft).toBe(0)
  })

  it('does nothing when the tabs all fit (no overflow)', () => {
    openTabs(2)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const strip = container.querySelector('.tab-bar__tabs')!
    stubOverflow(strip, 200, 200)

    fireEvent.wheel(strip, { deltaY: 60, deltaX: 0 })
    expect(strip.scrollLeft).toBe(0)
  })
})

describe('TabBar - active tab auto-reveal', () => {
  it('scrolls the newly activated tab into view', () => {
    const spy = vi
      .spyOn(HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => undefined)
    const ids = openTabs(3)
    render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    spy.mockClear() // ignore the mount-time reveal

    act(() => {
      useDocumentsStore.getState().activateDocument(ids[0]!)
    })

    expect(spy).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    // It is the ACTIVE tab's element that was revealed.
    const revealed = spy.mock.instances.at(-1) as HTMLElement
    expect(revealed.getAttribute('aria-selected')).toBe('true')
  })
})

describe('TabBar - guaranteed drag zone', () => {
  it('renders a never-shrinking drag zone between the tabs and the + button', () => {
    openTabs(3)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const bar = container.querySelector('.tab-bar')!
    const children = Array.from(bar.children).map((c) => c.className)
    // Order matters: tabs strip, then the drag zone, then the + button - the
    // zone is what keeps the window movable when tabs fill the strip.
    expect(children.indexOf('tab-bar__drag-zone')).toBeGreaterThan(
      children.indexOf('tab-bar__tabs'),
    )
    expect(children.indexOf('tab-bar__drag-zone')).toBeLessThan(
      children.findIndex((c) => c.includes('tab-bar__new')),
    )
  })
})

describe('TabBar - overflow edge fades', () => {
  /** Stub scroll metrics, then dispatch a scroll so the component re-measures. */
  function setScroll(el: Element, scrollLeft: number, scrollWidth: number, clientWidth: number) {
    Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
    Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
    el.scrollLeft = scrollLeft
    fireEvent.scroll(el)
  }

  it('shows only the right fade at the start, both mid-scroll, only the left at the end', () => {
    openTabs(5)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const strip = container.querySelector('.tab-bar__tabs')!
    const wrap = () => container.querySelector('.tab-bar__scroll')!

    setScroll(strip, 0, 800, 200) // parked at the far left
    expect(wrap().classList.contains('tab-bar__scroll--more-right')).toBe(true)
    expect(wrap().classList.contains('tab-bar__scroll--more-left')).toBe(false)

    setScroll(strip, 300, 800, 200) // mid-scroll
    expect(wrap().classList.contains('tab-bar__scroll--more-left')).toBe(true)
    expect(wrap().classList.contains('tab-bar__scroll--more-right')).toBe(true)

    setScroll(strip, 600, 800, 200) // far right (800 - 200)
    expect(wrap().classList.contains('tab-bar__scroll--more-left')).toBe(true)
    expect(wrap().classList.contains('tab-bar__scroll--more-right')).toBe(false)
  })

  it('shows no fades when all tabs fit', () => {
    openTabs(2)
    const { container } = render(<TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />)
    const strip = container.querySelector('.tab-bar__tabs')!
    setScroll(strip, 0, 200, 200)
    const wrap = container.querySelector('.tab-bar__scroll')!
    expect(wrap.classList.contains('tab-bar__scroll--more-left')).toBe(false)
    expect(wrap.classList.contains('tab-bar__scroll--more-right')).toBe(false)
  })
})

describe('TabBar - right-click context menu', () => {
  it('opens on contextmenu with the full close set, fires the action, and dismisses', () => {
    const ids = openTabs(3)
    const onCloseOthers = vi.fn()
    const { container, getAllByRole, getByRole, queryByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} onCloseOthers={onCloseOthers} />,
    )
    fireEvent.contextMenu(getAllByRole('tab')[1]!, { clientX: 120, clientY: 20 })

    const menu = container.querySelector('.tab-menu')!
    expect(menu).not.toBeNull()
    for (const label of ['Close', 'Close Others', 'Close to the Right', 'Close Saved', 'Close All']) {
      expect(getByRole('menuitem', { name: label })).toBeTruthy()
    }

    fireEvent.click(getByRole('menuitem', { name: 'Close Others' }))
    expect(onCloseOthers).toHaveBeenCalledWith(ids[1])
    // Acting dismisses the menu.
    expect(queryByRole('menu')).toBeNull()
  })

  it('shows Copy Path / Reveal for file tabs and routes the tab path', () => {
    openTabs(2)
    const onCopyPath = vi.fn()
    const onReveal = vi.fn()
    const { getAllByRole, getByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} onCopyPath={onCopyPath} onReveal={onReveal} />,
    )
    fireEvent.contextMenu(getAllByRole('tab')[0]!)
    fireEvent.click(getByRole('menuitem', { name: 'Copy Path' }))
    expect(onCopyPath).toHaveBeenCalledWith('/doc0.md')

    fireEvent.contextMenu(getAllByRole('tab')[1]!)
    fireEvent.click(getByRole('menuitem', { name: 'Reveal in Finder' }))
    expect(onReveal).toHaveBeenCalledWith('/doc1.md')
  })

  it('hides the path items for an Untitled (path-less) tab', () => {
    useDocumentsStore.getState().openDocument({ path: null, markdown: '' })
    const { getAllByRole, queryByRole, getByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    fireEvent.contextMenu(getAllByRole('tab')[0]!)
    expect(getByRole('menuitem', { name: 'Close' })).toBeTruthy()
    expect(queryByRole('menuitem', { name: 'Copy Path' })).toBeNull()
    expect(queryByRole('menuitem', { name: 'Reveal in Finder' })).toBeNull()
  })

  it('Escape dismisses the menu without firing anything', () => {
    openTabs(1)
    const onClose = vi.fn()
    const { getAllByRole, queryByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={onClose} onNew={noop} />,
    )
    fireEvent.contextMenu(getAllByRole('tab')[0]!)
    expect(queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(queryByRole('menu')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('TabBar - drag-to-reorder', () => {
  /** Minimal DataTransfer stand-in (happy-dom has no full DnD support). */
  function makeDataTransfer() {
    const store = new Map<string, string>()
    return {
      setData: (t: string, v: string) => { store.set(t, v) },
      getData: (t: string) => store.get(t) ?? '',
      get types() { return Array.from(store.keys()) },
      effectAllowed: '',
      dropEffect: '',
    }
  }

  it('dropping a tab on the left half of a later tab inserts it before that tab', () => {
    const ids = openTabs(3) // [a, b, c]
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    // Give the target tab a geometry so the slot math works in happy-dom.
    Object.defineProperty(tabs[2]!, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({ left: 200, width: 100, right: 300, top: 0, bottom: 26, height: 26, x: 200, y: 0, toJSON: () => ({}) }) as DOMRect,
    })

    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(tabs[0]!, { dataTransfer })
    // clientX 220 = left half of tab 2 -> slot 2; minus the vacated origin = 1.
    // (happy-dom's DragEvent drops MouseEvent coords, so clientX is assigned
    // onto the event instance instead of passed as init.)
    const dropEv = createEvent.drop(tabs[2]!)
    Object.assign(dropEv, { dataTransfer, clientX: 220 })
    fireEvent(tabs[2]!, dropEv)

    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/doc1.md', '/doc0.md', '/doc2.md',
    ])
    expect(ids[0]).toBe(useDocumentsStore.getState().documents[1]!.id)
  })

  it('dropping on the right half of the last tab moves the dragged tab to the end', () => {
    openTabs(3)
    const { getAllByRole } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    Object.defineProperty(tabs[2]!, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({ left: 200, width: 100, right: 300, top: 0, bottom: 26, height: 26, x: 200, y: 0, toJSON: () => ({}) }) as DOMRect,
    })

    const dataTransfer = makeDataTransfer()
    fireEvent.dragStart(tabs[0]!, { dataTransfer })
    const dropEv = createEvent.drop(tabs[2]!)
    Object.assign(dropEv, { dataTransfer, clientX: 280 }) // right half -> end slot
    fireEvent(tabs[2]!, dropEv)

    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/doc1.md', '/doc2.md', '/doc0.md',
    ])
  })

  it('ignores foreign drags (no tab MIME type) for the indicator and the drop', () => {
    openTabs(2)
    const { getAllByRole, container } = render(
      <TabBar {...menuNoop} onSelect={noop} onClose={noop} onNew={noop} />,
    )
    const tabs = getAllByRole('tab')
    const dataTransfer = { setData: noop, getData: () => '', types: ['Files'], effectAllowed: '', dropEffect: '' }
    fireEvent.dragOver(tabs[1]!, { dataTransfer })
    expect(container.querySelector('.tab--drop-before, .tab--drop-after')).toBeNull()
    fireEvent.drop(tabs[1]!, { dataTransfer })
    expect(useDocumentsStore.getState().documents.map((d) => d.path)).toEqual([
      '/doc0.md', '/doc1.md',
    ])
  })
})
