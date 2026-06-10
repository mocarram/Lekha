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
import * as fs from 'node:fs'
import * as path from 'node:path'
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
    equationNumbering: true,
    fontSize: 16,
    autoSave: true,
    spellCheck: true,
    spellCheckLanguage: 'en-US',
    smartPunctuation: true,
    sidebarWidth: 240,
    openTabPaths: [],
    pinnedTabPaths: [],
    activeTabPath: null,
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
async function renderOpen(
  onClose = vi.fn(),
  onApplyAutoSave = vi.fn(),
): Promise<void> {
  render(
    <Preferences open onClose={onClose} onApplyAutoSave={onApplyAutoSave} />,
  )
  await waitFor(() => expect(getSettingsMock).toHaveBeenCalled())
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('Preferences - rendering', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <Preferences open={false} onClose={vi.fn()} onApplyAutoSave={vi.fn()} />,
    )
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

  it('renders the "Number block equations" checkbox', async () => {
    await renderOpen()
    expect(screen.getByLabelText('Number block equations')).toBeTruthy()
  })

  it('reflects equationNumbering=true (default) when seeded from settings', async () => {
    stubLekha(makeSettings({ equationNumbering: true }))
    await renderOpen()
    const el = screen.getByLabelText('Number block equations')
    expect((el as HTMLInputElement).checked).toBe(true)
  })

  it('toggling equation numbering off persists it and updates the editor store', async () => {
    // Default is equationNumbering=true; clicking unchecks it.
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Number block equations'))
    expect(setSettingsMock).toHaveBeenCalledWith({ equationNumbering: false })
    expect(useEditorStore.getState().equationNumbering).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Editor: auto-save
// ---------------------------------------------------------------------------

describe('Preferences - auto-save', () => {
  it('renders the Auto-save checkbox', async () => {
    await renderOpen()
    expect(screen.getByLabelText('Auto-save')).toBeTruthy()
  })

  it('toggling auto-save routes through the shared onApplyAutoSave callback', async () => {
    // Default is autoSave=true; clicking unchecks it. The checkbox no longer
    // persists / updates the store inline - it delegates to the App-level
    // applyAutoSave helper (so the immediate-flush-on-enable rule is shared).
    const onApplyAutoSave = vi.fn()
    await renderOpen(vi.fn(), onApplyAutoSave)
    fireEvent.click(screen.getByLabelText('Auto-save'))
    expect(onApplyAutoSave).toHaveBeenCalledWith(false)
  })

  it('reflects autoSave=false when seeded from settings', async () => {
    stubLekha(makeSettings({ autoSave: false }))
    await renderOpen()
    const el = screen.getByLabelText('Auto-save')
    expect((el as HTMLInputElement).checked).toBe(false)
  })

  it('reflects autoSave=true (default) when seeded from settings', async () => {
    stubLekha(makeSettings({ autoSave: true }))
    await renderOpen()
    const el = screen.getByLabelText('Auto-save')
    expect((el as HTMLInputElement).checked).toBe(true)
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
// Spell check
// ---------------------------------------------------------------------------

describe('Preferences - spell check', () => {
  it('renders the "Check spelling" checkbox', async () => {
    await renderOpen()
    expect(screen.getByLabelText('Check spelling')).toBeTruthy()
  })

  it('renders the spell-check language select', async () => {
    await renderOpen()
    expect(screen.getByLabelText('Spell-check language')).toBeTruthy()
  })

  it('toggling spell check off persists it', async () => {
    // Default is spellCheck=true; clicking unchecks it.
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Check spelling'))
    expect(setSettingsMock).toHaveBeenCalledWith({ spellCheck: false })
  })

  it('toggling spell check on persists it when seeded false', async () => {
    stubLekha(makeSettings({ spellCheck: false }))
    await renderOpen()
    fireEvent.click(screen.getByLabelText('Check spelling'))
    expect(setSettingsMock).toHaveBeenCalledWith({ spellCheck: true })
  })

  it('reflects spellCheck=false when seeded from settings', async () => {
    stubLekha(makeSettings({ spellCheck: false }))
    await renderOpen()
    const el = screen.getByLabelText('Check spelling')
    expect((el as HTMLInputElement).checked).toBe(false)
  })

  it('reflects spellCheck=true when seeded from settings', async () => {
    stubLekha(makeSettings({ spellCheck: true }))
    await renderOpen()
    const el = screen.getByLabelText('Check spelling')
    expect((el as HTMLInputElement).checked).toBe(true)
  })

  it('changing spell-check language persists it', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Spell-check language'), {
      target: { value: 'fr' },
    })
    expect(setSettingsMock).toHaveBeenCalledWith({ spellCheckLanguage: 'fr' })
  })

  it('reflects spellCheckLanguage="de" when seeded from settings', async () => {
    stubLekha(makeSettings({ spellCheckLanguage: 'de' }))
    await renderOpen()
    const el = screen.getByLabelText('Spell-check language')
    expect((el as HTMLSelectElement).value).toBe('de')
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

// ---------------------------------------------------------------------------
// CSS regression guard: paragraph font-size must not be hardcoded in px
// ---------------------------------------------------------------------------

describe('Preferences - CSS regression guard', () => {
  it('github.css .ProseMirror p rule does not hardcode a px font-size', () => {
    // Read the CSS source directly and assert the paragraph rule uses `inherit`
    // (or a CSS var), NOT a bare px value. This guard will fail if the fix is
    // ever reverted, because happy-dom does not apply stylesheet cascade to
    // computed styles reliably enough to detect it at runtime.
    const cssPath = path.resolve(
      __dirname,
      '../../../src/renderer/styles/themes/github.css',
    )
    const css = fs.readFileSync(cssPath, 'utf8')

    // Find the `.ProseMirror p` rule block (up to the closing brace).
    const match = css.match(/\.editor-pane \.ProseMirror p\s*\{([^}]*)\}/)
    expect(match, 'Expected to find .editor-pane .ProseMirror p rule in github.css').toBeTruthy()
    const ruleBody = match![1]

    // The rule must NOT contain a bare px font-size (e.g. "font-size: 16px").
    // Using em, inherit, or a CSS var is all acceptable.
    expect(ruleBody).not.toMatch(/font-size\s*:\s*\d+px/)
  })
})

// ---------------------------------------------------------------------------
// Seeded values: opening with non-default settings renders them
// ---------------------------------------------------------------------------

describe('Preferences - seeded values', () => {
  it('renders the correct values when opened with non-default settings', async () => {
    const nonDefaults: Settings = makeSettings({
      theme: 'night',
      fontSize: 20,
      sidebarTab: 'outline',
      focusMode: true,
    })
    stubLekha(nonDefaults)

    await renderOpen()

    const themeEl = screen.getByLabelText('Theme')
    const fontEl = screen.getByLabelText('Font size')
    const tabEl = screen.getByLabelText('Sidebar default tab')
    const focusEl = screen.getByLabelText('Focus mode by default')

    expect((themeEl as HTMLSelectElement).value).toBe('night')
    expect((fontEl as HTMLInputElement).valueAsNumber).toBe(20)
    expect((tabEl as HTMLSelectElement).value).toBe('outline')
    expect((focusEl as HTMLInputElement).checked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Font-size boundary clamping
// ---------------------------------------------------------------------------

describe('Preferences - font size clamping', () => {
  it('clamps a value above MAX_FONT_SIZE (24) down to 24', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '999' } })
    expect(setSettingsMock).toHaveBeenCalledWith({ fontSize: 24 })
  })

  it('clamps a value below MIN_FONT_SIZE (12) up to 12', async () => {
    await renderOpen()
    fireEvent.change(screen.getByLabelText('Font size'), { target: { value: '2' } })
    expect(setSettingsMock).toHaveBeenCalledWith({ fontSize: 12 })
  })
})
