import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseMarkdown } from '../../../src/renderer/editor/parser'
import { serializeMarkdown } from '../../../src/renderer/editor/serializer'

/**
 * Task 6: idempotency corpus.
 *
 * For every fixture under tests/unit/fixtures, assert the markdown engine is a
 * fixed point: `serialize(parse(md)) === md`. The fixtures are authored in
 * canonical form, so they are stable from the very first pass. A second pass is
 * also checked to be byte-identical, guarding against any drift.
 */

const here = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(here, '..', 'fixtures')

const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.md'))
  .sort()

/** Read a fixture, dropping the single trailing newline editors conventionally add. */
function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf8').replace(/\n$/, '')
}

const rt = (md: string): string => serializeMarkdown(parseMarkdown(md))

describe('round-trip idempotency corpus', () => {
  it('discovers every fixture', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10)
  })

  for (const name of fixtures) {
    it(`is idempotent for ${name}`, () => {
      const original = readFixture(name)
      const once = rt(original)
      // Author fixtures are already canonical -> stable from pass 1.
      expect(once).toBe(original)
      // And the engine is a true fixed point: a second pass changes nothing.
      expect(rt(once)).toBe(once)
    })
  }
})
