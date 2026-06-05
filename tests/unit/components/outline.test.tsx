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
