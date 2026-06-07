/**
 * Unit tests for the user-themes loader (main process).
 *
 * Pure helpers (parse/derive/filter) are tested directly; the fs-backed
 * functions use a tmp directory.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseThemeMetadata,
  deriveUserTheme,
  isThemeFile,
  listUserThemes,
  ensureUserThemesDir,
} from '@main/userThemes'

describe('parseThemeMetadata', () => {
  it('extracts @name and @type from a header comment', () => {
    const css = '/* @name Solar Flare @type dark */\n[data-theme="x"] { --bg: #000; }'
    expect(parseThemeMetadata(css)).toEqual({ name: 'Solar Flare', type: 'dark' })
  })

  it('parses @name and @type on separate lines', () => {
    const css = '/*\n * @name  Calm Light\n * @type  light\n */'
    expect(parseThemeMetadata(css)).toEqual({ name: 'Calm Light', type: 'light' })
  })

  it('returns nulls when metadata is absent', () => {
    expect(parseThemeMetadata('[data-theme="x"] {}')).toEqual({ name: null, type: null })
  })

  it('ignores an invalid @type value', () => {
    expect(parseThemeMetadata('/* @type neon */').type).toBeNull()
  })

  it('ignores @name/@type in a NON-leading comment (bug 14)', () => {
    // The metadata-looking comment is inside a token value, not the header.
    const css =
      '[data-theme="evil"] {\n  --x: 1; /* @name Sneaky @type light */\n}'
    expect(parseThemeMetadata(css)).toEqual({ name: null, type: null })
  })

  it('reads metadata from the leading comment after whitespace only', () => {
    const css = '\n\n  /* @name Top @type dark */\n[data-theme="t"]{}'
    expect(parseThemeMetadata(css)).toEqual({ name: 'Top', type: 'dark' })
  })
})

describe('deriveUserTheme', () => {
  it('derives id from filename, label from @name, type from @type', () => {
    const t = deriveUserTheme('solar-flare.css', '/* @name Solar Flare @type light */')
    expect(t.id).toBe('solar-flare')
    expect(t.label).toBe('Solar Flare')
    expect(t.type).toBe('light')
  })

  it('falls back to id label and dark type when metadata missing', () => {
    const t = deriveUserTheme('my-theme.css', '[data-theme="my-theme"] {}')
    expect(t.id).toBe('my-theme')
    expect(t.label).toBe('my-theme')
    expect(t.type).toBe('dark')
  })
})

describe('isThemeFile', () => {
  it('accepts plain .css files', () => {
    expect(isThemeFile('cool.css')).toBe(true)
  })
  it('rejects templates/partials (leading underscore) and hidden/non-css', () => {
    expect(isThemeFile('_template.css')).toBe(false)
    expect(isThemeFile('.hidden.css')).toBe(false)
    expect(isThemeFile('readme.md')).toBe(false)
  })
})

describe('listUserThemes (fs)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lekha-themes-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns [] for a missing directory', async () => {
    expect(await listUserThemes(join(dir, 'nope'))).toEqual([])
  })

  it('lists *.css themes, skipping _template.css, sorted by label', async () => {
    writeFileSync(join(dir, 'zen.css'), '/* @name Zen @type light */ [data-theme="zen"]{}')
    writeFileSync(join(dir, 'abyss.css'), '/* @name Abyss */ [data-theme="abyss"]{}')
    writeFileSync(join(dir, '_template.css'), '[data-theme="my-theme"]{}')
    writeFileSync(join(dir, 'notes.md'), '# not a theme')
    const themes = await listUserThemes(dir)
    expect(themes.map((t) => t.id)).toEqual(['abyss', 'zen'])
    expect(themes[0]!.label).toBe('Abyss')
    expect(themes[1]!.type).toBe('light')
  })

  it('drops a user theme whose id collides with a built-in (bug 6)', async () => {
    // night.css -> id "night" collides with the built-in Night theme.
    writeFileSync(join(dir, 'night.css'), '/* @name Night 2.0 */ [data-theme="night"]{}')
    writeFileSync(join(dir, 'custom.css'), '/* @name Custom */ [data-theme="custom"]{}')
    const themes = await listUserThemes(dir)
    expect(themes.map((t) => t.id)).toEqual(['custom'])
  })

  it('does NOT follow a *.css symlink (no arbitrary file read)', async () => {
    // A symlink named like a theme, pointing at a secret outside the folder.
    const secret = join(dir, 'secret.txt')
    writeFileSync(secret, 'TOP SECRET')
    symlinkSync(secret, join(dir, 'evil.css'))
    writeFileSync(join(dir, 'real.css'), '[data-theme="real"]{}')
    const themes = await listUserThemes(dir)
    // Only the real regular file is listed; the symlink is skipped.
    expect(themes.map((t) => t.id)).toEqual(['real'])
    expect(JSON.stringify(themes)).not.toContain('TOP SECRET')
  })
})

describe('ensureUserThemesDir (fs)', () => {
  let parent: string
  beforeEach(() => {
    parent = mkdtempSync(join(tmpdir(), 'lekha-themes-parent-'))
  })
  afterEach(() => {
    rmSync(parent, { recursive: true, force: true })
  })

  it('creates the folder and seeds _template.css when empty', async () => {
    const dir = join(parent, 'themes')
    await ensureUserThemesDir(dir, '/* @name My Theme */ [data-theme="my-theme"]{}')
    const files = readdirSync(dir)
    expect(files).toContain('_template.css')
    expect(readFileSync(join(dir, '_template.css'), 'utf8')).toContain('@name My Theme')
  })

  it('does not overwrite when a *.css theme already exists', async () => {
    const dir = join(parent, 'themes')
    await ensureUserThemesDir(dir, 'SEED')
    writeFileSync(join(dir, '_template.css'), 'EDITED')
    writeFileSync(join(dir, 'mine.css'), '[data-theme="mine"]{}')
    await ensureUserThemesDir(dir, 'SEED-AGAIN')
    // _template.css is left untouched because a *.css already exists.
    expect(readFileSync(join(dir, '_template.css'), 'utf8')).toBe('EDITED')
  })
})
