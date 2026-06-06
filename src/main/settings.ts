import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { DEFAULT_FONT_SIZE } from '@shared/types'

export interface SettingsStore {
  get(): Promise<Settings>
  set(patch: Partial<Settings>): Promise<Settings>
  addRecentFile(path: string): Promise<void>
  getRecentFiles(): Promise<string[]>
}

const MAX_RECENT = 15

const DEFAULTS: Settings = {
  recentFiles: [],
  lastFolder: null,
  sidebarVisible: true,
  sidebarTab: 'files',
  theme: 'github',
  focusMode: false,
  typewriterMode: false,
  fontSize: DEFAULT_FONT_SIZE,
  autoSave: true,
  spellCheck: true,
  spellCheckLanguage: 'en-US',
}

export function createSettingsStore(baseDir: string): SettingsStore {
  const filePath = join(baseDir, 'settings.json')

  async function load(): Promise<Settings> {
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<Settings>
      return { ...DEFAULTS, ...parsed }
    } catch {
      // Missing or corrupt file - fall back to defaults.
      return { ...DEFAULTS }
    }
  }

  async function save(settings: Settings): Promise<void> {
    // Ensure the directory exists before writing.
    await mkdir(baseDir, { recursive: true })
    await writeFile(filePath, JSON.stringify(settings, null, 2), 'utf8')
  }

  return {
    async get(): Promise<Settings> {
      return load()
    },

    async set(patch: Partial<Settings>): Promise<Settings> {
      const current = await load()
      const next = { ...current, ...patch }
      await save(next)
      return next
    },

    async addRecentFile(path: string): Promise<void> {
      const current = await load()
      // Dedupe: remove any existing occurrence of this path, then prepend.
      const deduped = current.recentFiles.filter((p) => p !== path)
      // Cap the list at MAX_RECENT entries (most-recent-first).
      const next: Settings = {
        ...current,
        recentFiles: [path, ...deduped].slice(0, MAX_RECENT),
      }
      await save(next)
    },

    async getRecentFiles(): Promise<string[]> {
      const settings = await load()
      return settings.recentFiles
    },
  }
}
