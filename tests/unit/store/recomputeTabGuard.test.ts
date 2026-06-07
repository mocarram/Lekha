/**
 * Tests for the tab-switch debounce guard used in App.tsx handleChange.
 *
 * handleChange debounces the outline/word-count recompute (~150ms). On a tab
 * switch, loadTab recomputes synchronously for the NEW tab; a still-pending
 * recompute timer scheduled against the OLD tab must NOT fire and overwrite the
 * new tab's derived data with stale results.
 *
 * The guard stamps each scheduled recompute with the active tab id at schedule
 * time and, inside the timer callback, drops the result when the active tab no
 * longer matches. This test reproduces that exact scheduling logic against the
 * real documents store (recomputeDerived itself is module-internal to App.tsx,
 * so we assert via a spy whether the guarded recompute runs).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'

/**
 * Mirror of App.tsx handleChange's guarded debounce schedule. `recompute` stands
 * in for recomputeDerived; the guard mirrors the production code exactly.
 */
function scheduleGuardedRecompute(recompute: () => void): ReturnType<typeof setTimeout> {
  const scheduledForId = useDocumentsStore.getState().activeId
  return setTimeout(() => {
    if (useDocumentsStore.getState().activeId !== scheduledForId) return
    recompute()
  }, 150)
}

beforeEach(() => {
  vi.useFakeTimers()
  useDocumentsStore.getState().reset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('tab-switch debounce guard', () => {
  it('runs the recompute when the active tab is unchanged', () => {
    useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const recompute = vi.fn()

    scheduleGuardedRecompute(recompute)
    vi.advanceTimersByTime(150)

    expect(recompute).toHaveBeenCalledTimes(1)
  })

  it('drops a stale recompute scheduled against a tab that is no longer active', () => {
    const idA = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
    const idB = useDocumentsStore.getState().openDocument({ path: '/b.md', markdown: '# B' })
    // Make tab A active, then schedule a recompute stamped for A.
    useDocumentsStore.getState().activateDocument(idA)
    const recompute = vi.fn()
    scheduleGuardedRecompute(recompute)

    // Switch to tab B before the debounce fires (as selectTab would).
    useDocumentsStore.getState().activateDocument(idB)
    vi.advanceTimersByTime(150)

    // The stale recompute from tab A must NOT run and clobber tab B's data.
    expect(recompute).not.toHaveBeenCalled()
    expect(useDocumentsStore.getState().activeId).toBe(idB)
  })
})
