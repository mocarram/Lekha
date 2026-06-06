// @vitest-environment node
/**
 * Unit tests for the pure updateStatusMessage mapper in updater.ts.
 *
 * electron-updater is Electron-bound and cannot be exercised in the
 * vitest/Node environment, so we mock the electron + electron-updater modules
 * and only test the pure status->message mapper. The full check/download/notify
 * flow is verified MANUALLY on a packaged build.
 */
import { describe, it, expect, vi } from 'vitest'

// Mock the Electron-bound modules so importing updater.ts does not require a
// live Electron runtime. We only call the pure mapper, which touches neither.
vi.mock('electron', () => ({
  app: { isPackaged: false, getVersion: () => '0.1.0' },
  dialog: { showMessageBox: vi.fn() },
}))
vi.mock('electron-updater', () => ({
  default: { autoUpdater: { on: vi.fn() } },
}))

import { updateStatusMessage } from '../../../src/main/updater'

describe('updateStatusMessage', () => {
  it('maps "checking" to a checking message', () => {
    expect(updateStatusMessage('checking')).toMatch(/checking/i)
  })

  it('maps "not-available" to a latest-version message', () => {
    expect(updateStatusMessage('not-available')).toMatch(/latest/i)
  })

  it('includes the version in the "available" message when provided', () => {
    expect(updateStatusMessage('available', '1.2.3')).toContain('1.2.3')
  })

  it('falls back to a generic "available" message without a version', () => {
    const msg = updateStatusMessage('available')
    expect(msg).toMatch(/available/i)
    expect(msg).not.toContain('undefined')
  })

  it('includes the version in the "downloaded" message when provided', () => {
    expect(updateStatusMessage('downloaded', '2.0.0')).toContain('2.0.0')
  })

  it('maps "error" to a friendly failure message', () => {
    expect(updateStatusMessage('error')).toMatch(/could not check/i)
  })
})
