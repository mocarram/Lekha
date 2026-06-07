/**
 * Tests for the RecoveryNotice banner.
 *
 * The banner renders only while the ACTIVE tab has recovered === true.
 *   - Save  -> calls onSave (App wires this to fileOps.save, which on success
 *              clears the backup + recovered flag, hiding the banner).
 *   - × (dismiss) -> clears ONLY the recovered flag on the active tab; the
 *              content stays (tab remains dirty) and the backup is untouched.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen } from '@testing-library/react'
import { RecoveryNotice } from '../../../src/renderer/components/RecoveryNotice'
import { useDocumentsStore } from '../../../src/renderer/store/documentsStore'

/** Seed a single active tab and set its recovered flag. */
function seedActive(recovered: boolean): string {
  const id = useDocumentsStore.getState().openDocument({ path: '/a.md', markdown: '# A' })
  useDocumentsStore.getState().updateActive({ isDirty: true, recovered, backupId: 'b-1' })
  return id
}

beforeEach(() => {
  useDocumentsStore.getState().reset()
})

afterEach(() => {
  cleanup()
})

describe('RecoveryNotice', () => {
  it('renders nothing when the active tab is not recovered', () => {
    seedActive(false)
    const { container } = render(<RecoveryNotice onSave={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the banner when the active tab is recovered', () => {
    seedActive(true)
    render(<RecoveryNotice onSave={vi.fn()} />)
    expect(screen.getByText('Recovered unsaved changes - review and Save.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy()
  })

  it('Save invokes onSave (persist clears backup + recovered)', () => {
    seedActive(true)
    const onSave = vi.fn()
    render(<RecoveryNotice onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('Dismiss clears only the recovered flag - content stays, tab stays dirty, backup kept', () => {
    seedActive(true)
    render(<RecoveryNotice onSave={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    const tab = useDocumentsStore.getState().activeDocument()!
    expect(tab.recovered).toBe(false)
    expect(tab.isDirty).toBe(true) // not discarded
    expect(tab.backupId).toBe('b-1') // backup not removed
    // Banner is gone.
    expect(screen.queryByText('Recovered unsaved changes - review and Save.')).toBeNull()
  })
})
