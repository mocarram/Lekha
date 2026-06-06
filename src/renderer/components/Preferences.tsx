/**
 * Preferences - in-app settings modal (not a separate BrowserWindow).
 *
 * Opened from the app menu (Cmd+,) via the 'preferences' AppCommand. The modal
 * reads the current settings once on open (window.lekha.getSettings) to seed the
 * form, then for each control it both:
 *   1. applies the live effect immediately (so the change is visible without a
 *      restart), and
 *   2. persists the change via window.lekha.setSettings.
 *
 * Live-effect targets:
 *   - theme      -> applyTheme(id)           (CSS data-theme on <html>)
 *   - fontSize   -> applyFontSize(px)        (--editor-font-size CSS var)
 *   - focusMode  -> editorStore.setFocusMode
 *   - typewriter -> editorStore.setTypewriterMode
 *   - sidebar    -> workspaceStore.setSidebarVisible / setSidebarTab
 *
 * Token-themed (uses the shared dialog/* classes) so it works in light + dark.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  THEMES,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  DEFAULT_FONT_SIZE,
  type Settings,
} from '@shared/types'
import { applyTheme, applyFontSize } from '@renderer/themes/index'
import { useEditorStore } from '@renderer/store/editorStore'
import { useWorkspaceStore } from '@renderer/store/workspaceStore'
import { useFocusTrap } from '@renderer/hooks/useFocusTrap'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreferencesProps {
  open: boolean
  onClose: () => void
}

/** The subset of Settings the Preferences form edits. */
type FormState = Pick<
  Settings,
  | 'theme'
  | 'fontSize'
  | 'focusMode'
  | 'typewriterMode'
  | 'equationNumbering'
  | 'autoSave'
  | 'sidebarVisible'
  | 'sidebarTab'
  | 'spellCheck'
  | 'spellCheckLanguage'
>

const INITIAL_FORM: FormState = {
  theme: 'github',
  fontSize: DEFAULT_FONT_SIZE,
  focusMode: false,
  typewriterMode: false,
  equationNumbering: true,
  autoSave: true,
  sidebarVisible: true,
  sidebarTab: 'files',
  spellCheck: true,
  spellCheckLanguage: 'en-US',
}

/** Available spell-check languages surfaced in Preferences. */
const SPELL_CHECK_LANGUAGES: { value: string; label: string }[] = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es',    label: 'Spanish' },
  { value: 'fr',    label: 'French' },
  { value: 'de',    label: 'German' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Preferences({ open, onClose }: PreferencesProps) {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Confine Tab/Shift+Tab to the dialog while it is open.
  useFocusTrap(dialogRef, open)

  // Seed the form from the persisted settings each time the modal opens, and
  // move focus into the dialog for accessibility.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.lekha.getSettings().then((s) => {
      if (cancelled) return
      setForm({
        theme: s.theme,
        fontSize: s.fontSize,
        focusMode: s.focusMode,
        typewriterMode: s.typewriterMode,
        equationNumbering: s.equationNumbering,
        autoSave: s.autoSave,
        sidebarVisible: s.sidebarVisible,
        sidebarTab: s.sidebarTab,
        spellCheck: s.spellCheck,
        spellCheckLanguage: s.spellCheckLanguage,
      })
    })
    dialogRef.current?.focus()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  // Persist a settings patch. Each handler also applies the live effect.
  const persist = (patch: Partial<Settings>): void => {
    void window.lekha.setSettings(patch)
  }

  const handleTheme = (theme: string): void => {
    setForm((f) => ({ ...f, theme }))
    applyTheme(theme)
    persist({ theme })
  }

  const handleFontSize = (raw: string): void => {
    const parsed = Number.parseInt(raw, 10)
    if (Number.isNaN(parsed)) return
    // Clamp into the allowed range so manual typing can't escape the bounds.
    const fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, parsed))
    setForm((f) => ({ ...f, fontSize }))
    applyFontSize(fontSize)
    persist({ fontSize })
  }

  const handleFocusMode = (focusMode: boolean): void => {
    setForm((f) => ({ ...f, focusMode }))
    useEditorStore.getState().setFocusMode(focusMode)
    persist({ focusMode })
  }

  const handleTypewriterMode = (typewriterMode: boolean): void => {
    setForm((f) => ({ ...f, typewriterMode }))
    useEditorStore.getState().setTypewriterMode(typewriterMode)
    persist({ typewriterMode })
  }

  const handleEquationNumbering = (equationNumbering: boolean): void => {
    setForm((f) => ({ ...f, equationNumbering }))
    useEditorStore.getState().setEquationNumbering(equationNumbering)
    persist({ equationNumbering })
  }

  const handleAutoSave = (autoSave: boolean): void => {
    setForm((f) => ({ ...f, autoSave }))
    useEditorStore.getState().setAutoSave(autoSave)
    persist({ autoSave })
  }

  const handleSpellCheck = (spellCheck: boolean): void => {
    setForm((f) => ({ ...f, spellCheck }))
    persist({ spellCheck })
  }

  const handleSpellCheckLanguage = (spellCheckLanguage: string): void => {
    setForm((f) => ({ ...f, spellCheckLanguage }))
    persist({ spellCheckLanguage })
  }

  const handleSidebarVisible = (sidebarVisible: boolean): void => {
    setForm((f) => ({ ...f, sidebarVisible }))
    useWorkspaceStore.getState().setSidebarVisible(sidebarVisible)
    // Intentional duplicate: useStartup's store subscriber also persists this
    // change (after a debounce), but we persist eagerly here too so the value
    // is written even if the subscriber is not mounted (e.g. in tests). Harmless.
    persist({ sidebarVisible })
  }

  const handleSidebarTab = (sidebarTab: 'files' | 'outline'): void => {
    setForm((f) => ({ ...f, sidebarTab }))
    useWorkspaceStore.getState().setSidebarTab(sidebarTab)
    // Intentional duplicate: same reason as handleSidebarVisible above.
    persist({ sidebarTab })
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="dialog prefs"
        role="dialog"
        aria-modal="true"
        aria-label="Preferences"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="prefs-title">Preferences</h2>

        {/* ---------------------------------------------------------------- */}
        {/* Appearance */}
        {/* ---------------------------------------------------------------- */}
        <section className="prefs-section">
          <h3 className="prefs-heading">Appearance</h3>
          <div className="dialog-field">
            <label className="dialog-label" htmlFor="prefs-theme">
              Theme
            </label>
            <select
              id="prefs-theme"
              className="dialog-input"
              value={form.theme}
              onChange={(e) => handleTheme(e.target.value)}
              aria-label="Theme"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Editor */}
        {/* ---------------------------------------------------------------- */}
        <section className="prefs-section">
          <h3 className="prefs-heading">Editor</h3>

          <div className="dialog-field">
            <label className="dialog-label" htmlFor="prefs-font-size">
              Font size
            </label>
            <input
              id="prefs-font-size"
              type="number"
              className="dialog-input"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step={1}
              value={form.fontSize}
              onChange={(e) => handleFontSize(e.target.value)}
              aria-label="Font size"
            />
          </div>

          <p className="prefs-note">Default editor mode: WYSIWYG</p>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.focusMode}
              onChange={(e) => handleFocusMode(e.target.checked)}
              aria-label="Focus mode by default"
            />
            Focus mode by default
          </label>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.typewriterMode}
              onChange={(e) => handleTypewriterMode(e.target.checked)}
              aria-label="Typewriter mode by default"
            />
            Typewriter mode by default
          </label>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.equationNumbering}
              onChange={(e) => handleEquationNumbering(e.target.checked)}
              aria-label="Number block equations"
            />
            Number block equations
          </label>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.autoSave}
              onChange={(e) => handleAutoSave(e.target.checked)}
              aria-label="Auto-save"
            />
            Auto-save
          </label>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.spellCheck}
              onChange={(e) => handleSpellCheck(e.target.checked)}
              aria-label="Check spelling"
            />
            Check spelling
          </label>

          <div className="dialog-field">
            <label className="dialog-label" htmlFor="prefs-spell-lang">
              Spell-check language
            </label>
            <select
              id="prefs-spell-lang"
              className="dialog-input"
              value={form.spellCheckLanguage}
              onChange={(e) => handleSpellCheckLanguage(e.target.value)}
              aria-label="Spell-check language"
            >
              {SPELL_CHECK_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* General */}
        {/* ---------------------------------------------------------------- */}
        <section className="prefs-section">
          <h3 className="prefs-heading">General</h3>

          <label className="prefs-check">
            <input
              type="checkbox"
              checked={form.sidebarVisible}
              onChange={(e) => handleSidebarVisible(e.target.checked)}
              aria-label="Sidebar visible by default"
            />
            Sidebar visible by default
          </label>

          <div className="dialog-field">
            <label className="dialog-label" htmlFor="prefs-sidebar-tab">
              Sidebar default tab
            </label>
            <select
              id="prefs-sidebar-tab"
              className="dialog-input"
              value={form.sidebarTab}
              onChange={(e) =>
                handleSidebarTab(e.target.value === 'outline' ? 'outline' : 'files')
              }
              aria-label="Sidebar default tab"
            >
              <option value="files">Files</option>
              <option value="outline">Outline</option>
            </select>
          </div>
        </section>

        <div className="dialog-actions">
          <span className="dialog-spacer" />
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
