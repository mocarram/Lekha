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
})
