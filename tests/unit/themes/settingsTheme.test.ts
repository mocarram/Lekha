// @vitest-environment node
/**
 * Settings store tests specific to the theme field.
 *
 * Verifies that:
 *  - default theme is 'github'
 *  - theme can be set and round-trips correctly
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSettingsStore } from '../../../src/main/settings'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-settings-theme-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('Settings - theme field', () => {
  it('theme defaults to "midnight"', async () => {
    const store = createSettingsStore(tmpDir)
    const settings = await store.get()
    expect(settings.theme).toBe('midnight')
  })

  it('theme can be set to "night" and round-trips', async () => {
    const store = createSettingsStore(tmpDir)
    const result = await store.set({ theme: 'night' })
    expect(result.theme).toBe('night')

    // Confirm persistence via a fresh store on the same dir.
    const store2 = createSettingsStore(tmpDir)
    const persisted = await store2.get()
    expect(persisted.theme).toBe('night')
  })

  it('theme can be set to "sepia" and round-trips', async () => {
    const store = createSettingsStore(tmpDir)
    const result = await store.set({ theme: 'sepia' })
    expect(result.theme).toBe('sepia')

    const store2 = createSettingsStore(tmpDir)
    const persisted = await store2.get()
    expect(persisted.theme).toBe('sepia')
  })

  it('theme persists independently of other settings', async () => {
    const store = createSettingsStore(tmpDir)
    await store.set({ theme: 'night', sidebarVisible: false })

    const store2 = createSettingsStore(tmpDir)
    const result = await store2.get()
    expect(result.theme).toBe('night')
    expect(result.sidebarVisible).toBe(false)
    // Other defaults preserved
    expect(result.sidebarTab).toBe('files')
  })
})
