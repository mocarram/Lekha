// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSettingsStore } from '@main/settings'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-settings-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('createSettingsStore', () => {
  it('returns defaults when no settings file exists', async () => {
    const store = createSettingsStore(tmpDir)
    const settings = await store.get()
    expect(settings.recentFiles).toEqual([])
    expect(settings.lastFolder).toBeNull()
    expect(settings.sidebarVisible).toBe(true)
    expect(settings.sidebarTab).toBe('files')
    expect(settings.fontSize).toBe(16)
  })

  it('autoSave defaults to true', async () => {
    const store = createSettingsStore(tmpDir)
    const settings = await store.get()
    expect(settings.autoSave).toBe(true)
  })

  it('round-trips autoSave=false', async () => {
    const store = createSettingsStore(tmpDir)
    await store.set({ autoSave: false })

    const store2 = createSettingsStore(tmpDir)
    const persisted = await store2.get()
    expect(persisted.autoSave).toBe(false)
  })

  it('round-trips a custom fontSize', async () => {
    const store = createSettingsStore(tmpDir)
    const result = await store.set({ fontSize: 20 })
    expect(result.fontSize).toBe(20)

    const store2 = createSettingsStore(tmpDir)
    const persisted = await store2.get()
    expect(persisted.fontSize).toBe(20)
  })

  it('returns defaults when settings.json is corrupt', async () => {
    writeFileSync(join(tmpDir, 'settings.json'), 'not valid json{{{', 'utf8')
    const store = createSettingsStore(tmpDir)
    const settings = await store.get()
    expect(settings.recentFiles).toEqual([])
    expect(settings.sidebarVisible).toBe(true)
  })

  it('set() persists changes and returns merged settings', async () => {
    const store = createSettingsStore(tmpDir)
    const result = await store.set({ sidebarVisible: false, lastFolder: '/home/user/docs' })
    expect(result.sidebarVisible).toBe(false)
    expect(result.lastFolder).toBe('/home/user/docs')
    expect(result.sidebarTab).toBe('files') // default preserved

    // Confirm persistence: create a fresh store on same dir
    const store2 = createSettingsStore(tmpDir)
    const persisted = await store2.get()
    expect(persisted.sidebarVisible).toBe(false)
    expect(persisted.lastFolder).toBe('/home/user/docs')
  })

  describe('addRecentFile', () => {
    it('adds a file to recentFiles in most-recent-first order', async () => {
      const store = createSettingsStore(tmpDir)
      await store.addRecentFile('/a')
      await store.addRecentFile('/b')
      const files = await store.getRecentFiles()
      expect(files).toEqual(['/b', '/a'])
    })

    it('deduplicates and moves re-opened file to front', async () => {
      const store = createSettingsStore(tmpDir)
      await store.addRecentFile('/a')
      await store.addRecentFile('/b')
      await store.addRecentFile('/a') // re-open /a
      const files = await store.getRecentFiles()
      expect(files).toEqual(['/a', '/b'])
    })

    it('caps the list at 15 entries', async () => {
      const store = createSettingsStore(tmpDir)
      for (let i = 0; i < 20; i++) {
        await store.addRecentFile(`/file${i}`)
      }
      const files = await store.getRecentFiles()
      expect(files).toHaveLength(15)
      // Most recent entry should be first
      expect(files[0]).toBe('/file19')
    })

    it('persists recentFiles across a fresh store instance', async () => {
      const store = createSettingsStore(tmpDir)
      await store.addRecentFile('/doc.md')

      const store2 = createSettingsStore(tmpDir)
      const files = await store2.getRecentFiles()
      expect(files).toContain('/doc.md')
    })
  })

  describe('windowBounds', () => {
    it('round-trips windowBounds via set/get', async () => {
      const store = createSettingsStore(tmpDir)
      const bounds = { x: 100, y: 200, width: 1280, height: 800 }
      await store.set({ windowBounds: bounds })

      const result = await store.get()
      expect(result.windowBounds).toEqual(bounds)
    })

    it('persists windowBounds across a fresh store instance', async () => {
      const store = createSettingsStore(tmpDir)
      const bounds = { x: 50, y: 75, width: 1440, height: 900 }
      await store.set({ windowBounds: bounds })

      const store2 = createSettingsStore(tmpDir)
      const result = await store2.get()
      expect(result.windowBounds).toEqual(bounds)
    })

    it('windowBounds is absent by default (not in DEFAULTS)', async () => {
      const store = createSettingsStore(tmpDir)
      const result = await store.get()
      expect(result.windowBounds).toBeUndefined()
    })

    it('set() preserves other settings when updating windowBounds', async () => {
      const store = createSettingsStore(tmpDir)
      await store.set({ sidebarVisible: false, lastFolder: '/my/folder' })
      await store.set({ windowBounds: { x: 0, y: 0, width: 800, height: 600 } })

      const result = await store.get()
      expect(result.sidebarVisible).toBe(false)
      expect(result.lastFolder).toBe('/my/folder')
      expect(result.windowBounds).toEqual({ x: 0, y: 0, width: 800, height: 600 })
    })
  })
})
