/**
 * Unit tests for the useAutoSave hook.
 *
 * Uses renderHook + fake timers to verify the debounced save, blur-flush,
 * guard conditions, and unmount cleanup without touching any real file I/O.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAutoSave } from '../../../src/renderer/hooks/useAutoSave'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default options that satisfy all three guards (enabled, dirty, hasPath). */
function opts(overrides: Partial<Parameters<typeof useAutoSave>[0]> = {}) {
  return {
    enabled: true,
    isDirty: true,
    hasPath: true,
    save: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Debounced save
// ---------------------------------------------------------------------------

describe('useAutoSave - debounced save', () => {
  it('calls save once after the debounce interval when enabled+dirty+hasPath', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save })))

    // Not called yet (timer has not fired).
    expect(save).not.toHaveBeenCalled()

    // Advance past the 1500ms debounce.
    act(() => { vi.advanceTimersByTime(1500) })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('debounces: toggling isDirty off then on resets the timer for a single save', () => {
    const save = vi.fn()
    let isDirty = true
    const { rerender } = renderHook(() => useAutoSave(opts({ save, isDirty })))

    // Advance partially - timer would fire at 1500ms.
    act(() => { vi.advanceTimersByTime(700) })

    // Simulate a "clean then dirty again" cycle (e.g. undo/redo) - resets timer.
    isDirty = false
    rerender()
    isDirty = true
    rerender()

    // 700ms have elapsed. The timer was reset, so 1500ms from now is needed.
    expect(save).not.toHaveBeenCalled()

    // Advance to just under the new debounce window.
    act(() => { vi.advanceTimersByTime(1499) })
    expect(save).not.toHaveBeenCalled()

    // Now cross the threshold.
    act(() => { vi.advanceTimersByTime(1) })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does NOT save when enabled is false', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, enabled: false })))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(save).not.toHaveBeenCalled()
  })

  it('does NOT save when isDirty is false', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, isDirty: false })))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(save).not.toHaveBeenCalled()
  })

  it('does NOT save when hasPath is false (untitled document)', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, hasPath: false })))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(save).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Blur flush
// ---------------------------------------------------------------------------

describe('useAutoSave - blur flush', () => {
  it('saves immediately on window blur when enabled+dirty+hasPath', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save })))

    // Fire blur before the debounce timer would fire.
    act(() => { window.dispatchEvent(new Event('blur')) })

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does NOT save on blur when enabled is false', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, enabled: false })))
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(save).not.toHaveBeenCalled()
  })

  it('does NOT save on blur when isDirty is false', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, isDirty: false })))
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(save).not.toHaveBeenCalled()
  })

  it('does NOT save on blur when hasPath is false', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save, hasPath: false })))
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(save).not.toHaveBeenCalled()
  })

  it('blur cancels pending debounce timer so save is not called twice', () => {
    const save = vi.fn()
    renderHook(() => useAutoSave(opts({ save })))

    // Blur fires first - save called once, timer cancelled.
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(save).toHaveBeenCalledTimes(1)

    // The remaining timer should not fire again.
    act(() => { vi.advanceTimersByTime(2000) })
    expect(save).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Unmount cleanup
// ---------------------------------------------------------------------------

describe('useAutoSave - unmount cleanup', () => {
  it('cancels the pending timer on unmount so save is never called after unmount', () => {
    const save = vi.fn()
    const { unmount } = renderHook(() => useAutoSave(opts({ save })))

    // Unmount before the timer fires.
    act(() => { vi.advanceTimersByTime(700) })
    unmount()

    // Advance well past the debounce.
    act(() => { vi.advanceTimersByTime(2000) })

    expect(save).not.toHaveBeenCalled()
  })

  it('removes the blur listener on unmount', () => {
    const save = vi.fn()
    const { unmount } = renderHook(() => useAutoSave(opts({ save })))
    unmount()

    // Blur after unmount should not trigger save.
    act(() => { window.dispatchEvent(new Event('blur')) })
    expect(save).not.toHaveBeenCalled()
  })
})
