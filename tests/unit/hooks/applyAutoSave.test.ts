/**
 * Unit tests for the shared applyAutoSave helper.
 *
 * applyAutoSave is the single behaviour both auto-save controls (the native File
 * menu item and the Preferences checkbox) route through. It must always:
 *   - mirror the value into editorStore.autoSave,
 *   - persist it via window.lekha.setSettings,
 * and flush an immediate save ONLY when enabling while the active doc is both
 * dirty and has a path. Disabling never saves; enabling a clean or path-less doc
 * never saves.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { applyAutoSave } from '../../../src/renderer/hooks/applyAutoSave'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

let setSettings: ReturnType<typeof vi.fn>

beforeEach(() => {
  useEditorStore.getState().reset()
  setSettings = vi.fn(() => Promise.resolve())
  vi.stubGlobal('lekha', { setSettings })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('applyAutoSave - store + persist', () => {
  it('mirrors the value into editorStore and persists it (enable)', () => {
    const save = vi.fn(() => Promise.resolve())
    applyAutoSave(true, save)
    expect(useEditorStore.getState().autoSave).toBe(true)
    expect(setSettings).toHaveBeenCalledWith({ autoSave: true })
  })

  it('mirrors the value into editorStore and persists it (disable)', () => {
    useEditorStore.getState().setAutoSave(true)
    const save = vi.fn(() => Promise.resolve())
    applyAutoSave(false, save)
    expect(useEditorStore.getState().autoSave).toBe(false)
    expect(setSettings).toHaveBeenCalledWith({ autoSave: false })
  })
})

describe('applyAutoSave - immediate flush on enable', () => {
  it('saves immediately when enabling while dirty with a path', () => {
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()
    const save = vi.fn(() => Promise.resolve())

    applyAutoSave(true, save)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('does NOT save when enabling while clean', () => {
    useEditorStore.getState().openFile('/a.md', '# A') // clean (isDirty=false)
    const save = vi.fn(() => Promise.resolve())

    applyAutoSave(true, save)
    expect(save).not.toHaveBeenCalled()
  })

  it('does NOT save when enabling a dirty doc with no path (Untitled)', () => {
    useEditorStore.getState().openFile(null, 'draft')
    useEditorStore.getState().markDirty()
    const save = vi.fn(() => Promise.resolve())

    applyAutoSave(true, save)
    expect(save).not.toHaveBeenCalled()
  })

  it('never saves when disabling, even when dirty with a path', () => {
    useEditorStore.getState().openFile('/a.md', '# A')
    useEditorStore.getState().markDirty()
    const save = vi.fn(() => Promise.resolve())

    applyAutoSave(false, save)
    expect(save).not.toHaveBeenCalled()
  })
})
