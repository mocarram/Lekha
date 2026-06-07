// @vitest-environment node
/**
 * Confinement test for the path-taking file IPC handlers (src/main/ipc/files.ts).
 *
 * registerFileHandlers registers ipcMain.handle handlers we cannot reach through
 * Electron in vitest, so we mock 'electron' to capture them and invoke their
 * bodies directly. The permittedRoots allowlist is the trust boundary: a path
 * that was never granted must be rejected, while a granted path reads normally.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Capture handlers + ipcMain.on listeners as they are registered.
const handlers = new Map<string, (...args: unknown[]) => unknown>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => {
      handlers.set(channel, fn)
    },
    on: () => { /* setDocumentState listener - unused here */ },
  },
  BrowserWindow: { fromWebContents: () => null },
}))

import { registerFileHandlers } from '@main/ipc/files'
import { IPC } from '@shared/ipc-channels'
import { grantRoot, resetPermittedRoots } from '@main/permittedRoots'
import type { SettingsStore } from '@main/settings'
import type { WindowRegistry } from '@main/window'

let tmpDir: string
let allowedFile: string

/** Minimal SettingsStore stub - the confinement handlers under test never call it. */
const fakeSettings = {} as unknown as SettingsStore
const fakeRegistry = { get: () => undefined } as unknown as WindowRegistry

beforeEach(() => {
  handlers.clear()
  resetPermittedRoots()
  registerFileHandlers(fakeSettings, fakeRegistry, undefined, undefined, () => tmpDir)
  tmpDir = mkdtempSync(join(tmpdir(), 'lekha-confine-'))
  allowedFile = join(tmpDir, 'allowed.md')
  writeFileSync(allowedFile, '# Allowed\nbody\n', 'utf8')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

/** Invoke a captured handler body with a fake IPC event. */
function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = handlers.get(channel)
  if (!handler) throw new Error(`handler not registered: ${channel}`)
  return handler({}, ...args)
}

describe('files.ts path confinement', () => {
  it('rejects readFile for a path that was never granted', async () => {
    await expect(invoke(IPC.readFile, allowedFile)).rejects.toThrow(/not permitted/i)
  })

  it('reads a file once its dir is granted', async () => {
    grantRoot(tmpDir)
    await expect(invoke(IPC.readFile, allowedFile)).resolves.toContain('Allowed')
  })

  it('rejects writeFile for an un-granted path, allows it after grant', async () => {
    const target = join(tmpDir, 'out.md')
    await expect(invoke(IPC.writeFile, target, 'data')).rejects.toThrow(/not permitted/i)
    grantRoot(tmpDir)
    await expect(invoke(IPC.writeFile, target, 'data')).resolves.toBeUndefined()
  })

  it('rejects a path outside the granted dir even after a sibling grant', async () => {
    grantRoot(tmpDir)
    const outside = join(tmpdir(), 'lekha-elsewhere-secret.md')
    await expect(invoke(IPC.readFile, outside)).rejects.toThrow(/not permitted/i)
  })
})
