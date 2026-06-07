/**
 * Tests for the ErrorBoundary fallback.
 *
 * When a child throws during render, the boundary renders a recovery panel
 * (a message + a Reload button) instead of letting the tree crash. The error is
 * logged via console.error (componentDidCatch). The Reload button calls
 * window.location.reload().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { ErrorBoundary } from '../../../src/renderer/components/ErrorBoundary'

/** A child that throws on render to trip the boundary. */
function Boom(): never {
  throw new Error('kaboom')
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  // React logs the error itself; silence both that and our componentDidCatch
  // log so the test output stays clean while still asserting we logged.
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>child content</div>
      </ErrorBoundary>,
    )
    expect(screen.getByText('child content')).toBeTruthy()
  })

  it('renders the fallback and a Reload button when a child throws', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    // componentDidCatch logged the failure.
    expect(errorSpy).toHaveBeenCalled()
  })

  it('reloads the window when the Reload button is clicked', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: original,
    })
  })
})
