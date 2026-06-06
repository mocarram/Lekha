/**
 * Tests for the Preferences modal.
 *
 * The modal reads the current settings on open (window.lekha.getSettings),
 * applies live effects (theme via applyTheme, font via the --editor-font-size
 * CSS var, focus/typewriter via editorStore, sidebar via workspaceStore) and
 * persists each change via window.lekha.setSettings.
 *
 * window.lekha and applyTheme are mocked so we can assert the calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import type { Settings } from '../../../src/shared/types'
import type { LekhaAPI } from '../../../src/preload/api'
import { useEditorStore } from '../../../src/renderer/store/editorStore'
import { useWorkspaceStore } from '../../../src/renderer/store/workspaceStore'
import type * as ThemesModule from '../../../src/renderer/themes/index'

// applyTheme is mocked: we only want to assert it is called with the chosen id,
// not actually mutate document.documentElement.dataset.theme. vi.hoisted lets
// the mock fn be referenced inside the hoisted vi.mock factory.
const { applyThemeMock } = vi.hoisted(() => ({ applyThemeMock: vi.fn() }))
vi.mock('../../../src/renderer/themes/index', async (importOriginal) => {
  const actual = await importOriginal<typeof ThemesModule>()
  return { ...actual, applyTheme: applyThemeMock }
})

import { Preferences } from '../../../src/renderer/components/Preferences'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    recentFiles: [],
    lastFolder: null,
    sidebarVisible: true,
    sidebarTab: 'files',
    theme: 'github',
    focusMode: false,
    typewriterMode: false,
    fontSize: 16,
    ...overrides,
  }
}

let setSettingsMock: ReturnType<typeof vi.fn<(patch: Partial<Settings>) => Promise<Settings>>>
let getSettingsMock: ReturnType<typeof vi.fn<() => Promise<Settings>>>

function stubLekha(settings: Settings): void {
  setSettingsMock = vi.fn((patch: Partial<Settings>) =>
    Promise.resolve({ ...settings, ...patch }),
  )
  getSettingsMock = vi.fn(() => Promise.resolve(settings))
  const mockLekha: Partial<LekhaAPI> = {
    getSettings: getSettingsMock,
    setSettings: setSettingsMock,
  }
  vi.stubGlobal('lekha', mockLekha)
}

beforeEach(() => {
  applyThemeMock.mockClear()
  useEditorStore.getState().reset()
  useWorkspaceStore.setState({ sidebarVisible: true, sidebarTab: 'files' })
  stubLekha(makeSettings())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Render the modal open and wait for the initial getSettings() to resolve. */
async function renderOpen(onClose = vi.fn()): Promise<void> {
  render(<Preferences open onClose={onClose} />)
  await waitFor(() => expect(getSettingsMock).toHaveBeenCalled())
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Preferences - rendering', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<Preferences open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders a dialog with the three sections and key controls when open', async () => {
    await renderOpen()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('Appearance')).toBeTruthy()
    expect(screen.getByText('Editor')).toBeTruthy()
    expect(screen.getByText('General')).toBeTruthy()
    expect(screen.getByLabelText('Theme')).toBeTruthy()
    expect(screen.getByLabelText('Font size')).toBeTruthy()
    expect(screen.getByLabelText('Focus mode by default')).toBeTruthy()
    expect(screen.getByLabelText('Sidebar visible by default')).toBeTruthy()
    expect(screen.getByLabelText('Sidebar default tab')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Appearance: theme
// ---------------------------------------------------------------------------

describe('Preferences - theme', () => {
  it('changing the theme persists it and applies it live', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'night' } })
    expect(applyThemeMock).toHaveBeenCalledWith('night')
    expect(setSettingsMock).toHaveBeenCalledWith({ theme: 'night' })
  })
})

// ---------------------------------------------------------------------------
// Editor: font size
// ---------------------------------------------------------------------------

describe('Preferences - font size', () => {
  it('changing the font size persists it and sets the --editor-font-size var', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '20' } })
    expect(setSettingsMock).toHaveBeenCalledWith({ fontSize: 20 })
    expect(
      document.documentElement.style.getPropertyValue('--editor-font-size'),
    ).toBe('20px')
  })
})

// ---------------------------------------------------------------------------
// Editor: focus / typewriter defaults
// ---------------------------------------------------------------------------

describe('Preferences - editor toggles', () => {
  it('toggling focus mode persists it and updates the editor store', async () => {
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Focus mode by default'))
    expect(setSettingsMock).toHaveBeenCalledWith({ focusMode: true })
    expect(useEditorStore.getState().focusMode).toBe(true)
  })

  it('toggling typewriter mode persists it and updates the editor store', async () => {
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Typewriter mode by default'))
    expect(setSettingsMock).toHaveBeenCalledWith({ typewriterMode: true })
    expect(useEditorStore.getState().typewriterMode).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// General: sidebar
// ---------------------------------------------------------------------------

describe('Preferences - sidebar', () => {
  it('toggling sidebar visibility persists it and updates the workspace store', async () => {
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Sidebar visible by default'))
    expect(setSettingsMock).toHaveBeenCalledWith({ sidebarVisible: false })
    expect(useWorkspaceStore.getState().sidebarVisible).toBe(false)
  })

  it('changing the default tab persists it and updates the workspace store', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Sidebar default tab'), {
      target: { value: 'outline' },
    })
    expect(setSettingsMock).toHaveBeenCalledWith({ sidebarTab: 'outline' })
    expect(useWorkspaceStore.getState().sidebarTab).toBe('outline')
  })
})

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

describe('Preferences - close', () => {
  it('Done button calls onClose', async () => {
    const onClose = vi.fn()
    await renderOpen(onClose)
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', async () => {
    const onClose = vi.fn()
    await renderOpen(onClose)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
