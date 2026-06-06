/**
 * Tests for Outline component.
 *
 * Outline renders heading items indented by level, calls onJump when clicked,
 * and shows "No headings" when the items list is empty.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { Outline } from '../../../src/renderer/components/Outline'
import type { OutlineItem } from '../../../src/shared/types'

afterEach(() => {
  cleanup()
})

const ITEMS: OutlineItem[] = [
  { level: 1, text: 'Introduction', pos: 0 },
  { level: 2, text: 'Getting Started', pos: 20 },
  { level: 3, text: 'Installation', pos: 50 },
  { level: 2, text: 'Usage', pos: 80 },
]

describe('Outline', () => {
  it('renders all heading items', () => {
    const { getByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    expect(getByText('Introduction')).toBeTruthy()
    expect(getByText('Getting Started')).toBeTruthy()
    expect(getByText('Installation')).toBeTruthy()
    expect(getByText('Usage')).toBeTruthy()
  })

  it('renders the outline root class', () => {
    const { container } = render(<Outline items={ITEMS} onJump={() => {}} />)
    expect(container.querySelector('.outline')).not.toBeNull()
  })

  it('shows "No headings" empty state when items is empty', () => {
    const { getByText } = render(<Outline items={[]} onJump={() => {}} />)
    expect(getByText(/No headings/i)).toBeTruthy()
  })

  it('calls onJump with the correct pos when an item is clicked', () => {
    const onJump = vi.fn()
    const { getByText } = render(<Outline items={ITEMS} onJump={onJump} />)
    fireEvent.click(getByText('Getting Started'))
    expect(onJump).toHaveBeenCalledWith(20)
  })

  it('calls onJump with pos=0 for the first item', () => {
    const onJump = vi.fn()
    const { getByText } = render(<Outline items={ITEMS} onJump={onJump} />)
    fireEvent.click(getByText('Introduction'))
    expect(onJump).toHaveBeenCalledWith(0)
  })

  it('indents items based on level: level-1 has less indent than level-2', () => {
    const { getByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    const level1El = getByText('Introduction').closest('.outline__item') as HTMLElement
    const level2El = getByText('Getting Started').closest('.outline__item') as HTMLElement
    const level3El = getByText('Installation').closest('.outline__item') as HTMLElement

    // Parse paddingLeft values
    const pl1 = parseInt(level1El.style.paddingLeft || '0', 10)
    const pl2 = parseInt(level2El.style.paddingLeft || '0', 10)
    const pl3 = parseInt(level3El.style.paddingLeft || '0', 10)

    // Each level adds indentation
    expect(pl2).toBeGreaterThan(pl1)
    expect(pl3).toBeGreaterThan(pl2)
  })

  it('renders a single heading item correctly', () => {
    const single: OutlineItem[] = [{ level: 1, text: 'Only Heading', pos: 5 }]
    const onJump = vi.fn()
    const { getByText } = render(<Outline items={single} onJump={onJump} />)
    fireEvent.click(getByText('Only Heading'))
    expect(onJump).toHaveBeenCalledWith(5)
  })
})

describe('Outline - collapsible tree', () => {
  // Introduction (H1) > Getting Started (H2) > Installation (H3); Usage (H2)
  // is a second child of Introduction. So Introduction has children.
  function chevronOf(label: HTMLElement): HTMLElement | null {
    const row = label.closest('.outline__row') as HTMLElement
    return row?.querySelector('.outline__chevron') ?? null
  }

  it('renders a chevron for a node that has children', () => {
    const { getByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    const intro = getByText('Introduction')
    expect(chevronOf(intro)).not.toBeNull()
  })

  it('does not render a chevron for a leaf node', () => {
    const { getByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    const installation = getByText('Installation')
    expect(chevronOf(installation)).toBeNull()
  })

  it('collapsing a node hides its descendants', () => {
    const { getByText, queryByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    // All descendants visible initially.
    expect(queryByText('Getting Started')).not.toBeNull()
    expect(queryByText('Installation')).not.toBeNull()
    expect(queryByText('Usage')).not.toBeNull()

    const chevron = chevronOf(getByText('Introduction'))!
    fireEvent.click(chevron)

    // Descendants are hidden; the collapsed node itself stays.
    expect(queryByText('Introduction')).not.toBeNull()
    expect(queryByText('Getting Started')).toBeNull()
    expect(queryByText('Installation')).toBeNull()
    expect(queryByText('Usage')).toBeNull()
  })

  it('re-expands a collapsed node when its chevron is clicked again', () => {
    const { getByText, queryByText } = render(<Outline items={ITEMS} onJump={() => {}} />)
    const chevron = chevronOf(getByText('Introduction'))!
    fireEvent.click(chevron)
    expect(queryByText('Getting Started')).toBeNull()
    fireEvent.click(chevronOf(getByText('Introduction'))!)
    expect(queryByText('Getting Started')).not.toBeNull()
  })

  it('clicking the label still calls onJump with the pos', () => {
    const onJump = vi.fn()
    const { getByText } = render(<Outline items={ITEMS} onJump={onJump} />)
    fireEvent.click(getByText('Getting Started'))
    expect(onJump).toHaveBeenCalledWith(20)
  })

  it('clicking the chevron does NOT call onJump', () => {
    const onJump = vi.fn()
    const { getByText } = render(<Outline items={ITEMS} onJump={onJump} />)
    fireEvent.click(chevronOf(getByText('Introduction'))!)
    expect(onJump).not.toHaveBeenCalled()
  })
})
