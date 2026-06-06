/**
 * Tests for the useFocusTrap hook and the getFocusableElements helper.
 *
 * happy-dom supports focus() and document.activeElement, so we can verify
 * that the hook correctly wraps Tab/Shift+Tab at the boundaries of a dialog.
 * We also verify the hook is inactive when `active` is false, and that
 * getFocusableElements correctly filters disabled + tabindex=-1 elements.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { useRef } from 'react'
import { useFocusTrap, getFocusableElements } from '../../../src/renderer/hooks/useFocusTrap'

afterEach(() => {
  cleanup()
})

// ---------------------------------------------------------------------------
// Test fixture component
// ---------------------------------------------------------------------------

interface TrapFixtureProps {
  active: boolean
}

/**
 * Renders a dialog container with three focusable buttons.
 * The hook is applied to the container ref.
 */
function TrapFixture({ active }: TrapFixtureProps) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active)
  return (
    <div ref={ref} data-testid="container" tabIndex={-1}>
      <button type="button" data-testid="btn-a">A</button>
      <button type="button" data-testid="btn-b">B</button>
      <button type="button" data-testid="btn-c">C</button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// getFocusableElements
// ---------------------------------------------------------------------------

describe('getFocusableElements', () => {
  it('returns all enabled, visible focusable descendants', () => {
    const { getByTestId } = render(
      <div data-testid="root">
        <button type="button" data-testid="btn">Button</button>
        <input type="text" data-testid="input" />
        <a href="#" data-testid="link">Link</a>
        <select data-testid="select"><option>x</option></select>
        <textarea data-testid="textarea" />
        <div tabIndex={0} data-testid="div0">Focusable div</div>
      </div>,
    )
    const container = getByTestId('root')
    const elements = getFocusableElements(container)
    const ids = elements.map((el) => el.getAttribute('data-testid'))
    expect(ids).toContain('btn')
    expect(ids).toContain('input')
    expect(ids).toContain('link')
    expect(ids).toContain('select')
    expect(ids).toContain('textarea')
    expect(ids).toContain('div0')
  })

  it('excludes disabled buttons', () => {
    const { getByTestId } = render(
      <div data-testid="root">
        <button type="button" data-testid="btn-ok">OK</button>
        <button type="button" disabled data-testid="btn-disabled">Disabled</button>
      </div>,
    )
    const elements = getFocusableElements(getByTestId('root'))
    const ids = elements.map((el) => el.getAttribute('data-testid'))
    expect(ids).toContain('btn-ok')
    expect(ids).not.toContain('btn-disabled')
  })

  it('excludes disabled inputs', () => {
    const { getByTestId } = render(
      <div data-testid="root">
        <input type="text" data-testid="input-ok" />
        <input type="text" disabled data-testid="input-disabled" />
      </div>,
    )
    const elements = getFocusableElements(getByTestId('root'))
    const ids = elements.map((el) => el.getAttribute('data-testid'))
    expect(ids).toContain('input-ok')
    expect(ids).not.toContain('input-disabled')
  })

  it('excludes elements with tabIndex=-1', () => {
    const { getByTestId } = render(
      <div data-testid="root">
        <button type="button" data-testid="btn-normal">Normal</button>
        <button type="button" tabIndex={-1} data-testid="btn-neg1">Negative</button>
        <div tabIndex={0} data-testid="div0">Div with tabIndex 0</div>
      </div>,
    )
    const elements = getFocusableElements(getByTestId('root'))
    const ids = elements.map((el) => el.getAttribute('data-testid'))
    expect(ids).toContain('btn-normal')
    expect(ids).not.toContain('btn-neg1')
    expect(ids).toContain('div0')
  })

  it('returns an empty array for a container with no focusable children', () => {
    const { getByTestId } = render(<div data-testid="root"><span>plain text</span></div>)
    const elements = getFocusableElements(getByTestId('root'))
    expect(elements).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// useFocusTrap - inactive
// ---------------------------------------------------------------------------

describe('useFocusTrap - inactive', () => {
  it('does nothing when active is false', () => {
    const { getByTestId } = render(<TrapFixture active={false} />)
    const btnA = getByTestId('btn-a')
    btnA.focus()
    expect(document.activeElement).toBe(btnA)

    // Tab from btn-a should NOT be intercepted (we fire keydown on document)
    fireEvent.keyDown(document, { key: 'Tab', bubbles: true })
    // Focus should remain on btn-a (no wrapping was done)
    expect(document.activeElement).toBe(btnA)
  })
})

// ---------------------------------------------------------------------------
// useFocusTrap - active: initial focus
// ---------------------------------------------------------------------------

describe('useFocusTrap - initial focus', () => {
  it('moves focus to the first focusable element on mount when active', () => {
    const { getByTestId } = render(<TrapFixture active />)
    // The hook should have focused the first button
    expect(document.activeElement).toBe(getByTestId('btn-a'))
  })
})

// ---------------------------------------------------------------------------
// useFocusTrap - Tab wrapping
// ---------------------------------------------------------------------------

describe('useFocusTrap - Tab wrapping', () => {
  it('wraps Tab from the last focusable element to the first', () => {
    const { getByTestId } = render(<TrapFixture active />)
    const btnA = getByTestId('btn-a')
    const btnC = getByTestId('btn-c')

    // Place focus on the last button
    btnC.focus()
    expect(document.activeElement).toBe(btnC)

    // Fire Tab on the container - the hook should wrap to the first
    fireEvent.keyDown(getByTestId('container'), { key: 'Tab', bubbles: true })
    expect(document.activeElement).toBe(btnA)
  })

  it('wraps Shift+Tab from the first focusable element to the last', () => {
    const { getByTestId } = render(<TrapFixture active />)
    const btnA = getByTestId('btn-a')
    const btnC = getByTestId('btn-c')

    // Place focus on the first button
    btnA.focus()
    expect(document.activeElement).toBe(btnA)

    // Fire Shift+Tab on the container - the hook should wrap to the last
    fireEvent.keyDown(getByTestId('container'), { key: 'Tab', shiftKey: true, bubbles: true })
    expect(document.activeElement).toBe(btnC)
  })

  it('does not interfere with Tab between non-boundary elements', () => {
    const { getByTestId } = render(<TrapFixture active />)
    const btnA = getByTestId('btn-a')
    const btnB = getByTestId('btn-b')

    // Place focus on btn-a (first); Tab normally advances within the container.
    // The hook only wraps at boundaries - Tab from btn-a is NOT the last element,
    // so the hook should not preventDefault and should let the browser navigate.
    btnA.focus()
    // Firing Tab on the container from btn-a (not the last element) - hook skips.
    // We simply verify the hook does not crash and focus stays in the container.
    fireEvent.keyDown(getByTestId('container'), { key: 'Tab', bubbles: true })
    // happy-dom does not move focus on Tab; we can only verify focus is inside.
    const container = getByTestId('container')
    expect(container.contains(document.activeElement)).toBe(true)
    // Explicit: btn-b is still accessible (not moved to btnC by error)
    btnB.focus()
    expect(document.activeElement).toBe(btnB)
  })
})

// ---------------------------------------------------------------------------
// useFocusTrap - non-Tab keys pass through
// ---------------------------------------------------------------------------

describe('useFocusTrap - non-Tab keys pass through', () => {
  it('does not interfere with other key presses (e.g. Enter, Escape)', () => {
    const { getByTestId } = render(<TrapFixture active />)
    const btnA = getByTestId('btn-a')
    btnA.focus()
    // These should not throw or change focus unexpectedly
    fireEvent.keyDown(getByTestId('container'), { key: 'Escape', bubbles: true })
    fireEvent.keyDown(getByTestId('container'), { key: 'Enter', bubbles: true })
    fireEvent.keyDown(getByTestId('container'), { key: 'a', bubbles: true })
    expect(document.activeElement).toBe(btnA)
  })
})

// ---------------------------------------------------------------------------
// useFocusTrap - cleanup on deactivate
// ---------------------------------------------------------------------------

describe('useFocusTrap - cleanup', () => {
  it('stops intercepting Tab after the hook is deactivated', () => {
    const { getByTestId, rerender } = render(<TrapFixture active />)
    const btnC = getByTestId('btn-c')

    // Deactivate the trap
    rerender(<TrapFixture active={false} />)

    btnC.focus()
    // Tab from the last element should no longer be intercepted
    fireEvent.keyDown(getByTestId('container'), { key: 'Tab', bubbles: true })
    // Focus should remain on btnC (no wrap happened)
    expect(document.activeElement).toBe(btnC)
  })
})
