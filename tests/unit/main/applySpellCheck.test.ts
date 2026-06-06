// @vitest-environment node
/**
 * Tests for the applySpellCheck helper.
 *
 * applySpellCheck is Electron-runtime-free (only a session-shaped interface),
 * so it runs fine in a plain Node vitest environment.
 */
import { describe, it, expect, vi } from 'vitest'
import { applySpellCheck } from '../../../src/main/spellCheck'

interface MockSession {
  setSpellCheckerLanguages: ReturnType<typeof vi.fn<(languages: string[]) => void>>
}

function makeSession(): MockSession {
  return { setSpellCheckerLanguages: vi.fn<(languages: string[]) => void>() }
}

describe('applySpellCheck', () => {
  it('sets languages to [] when spellCheck is false', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: false, language: 'en-US' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith([])
  })

  it('sets languages to [] when spellCheck is false, regardless of language', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: false, language: 'fr' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith([])
  })

  it('sets languages to [language] when spellCheck is true', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: true, language: 'en-US' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['en-US'])
  })

  it('sets languages to [fr] when spellCheck is true with language "fr"', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: true, language: 'fr' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['fr'])
  })

  it('sets languages to [de] when spellCheck is true with language "de"', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: true, language: 'de' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledWith(['de'])
  })

  it('calls setSpellCheckerLanguages exactly once per call', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: true, language: 'es' })
    expect(session.setSpellCheckerLanguages).toHaveBeenCalledTimes(1)
  })

  it('passes a single-element array (not multiple languages)', () => {
    const session = makeSession()
    applySpellCheck(session, { spellCheck: true, language: 'pt-BR' })
    const called = session.setSpellCheckerLanguages.mock.calls[0] as [string[]]
    expect(called[0]).toHaveLength(1)
    expect(called[0][0]).toBe('pt-BR')
  })
})
