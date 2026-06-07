// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  buildPandocArgs,
  PANDOC_FORMATS,
  type PandocFormat,
} from '@main/ipc/export'
// pandocExtension moved to the shared single-source-of-truth module; main's
// PANDOC_META now derives its extensions from PANDOC_EXTENSIONS there.
import { pandocExtension } from '@shared/pandocFormats'

describe('buildPandocArgs', () => {
  it('builds docx args with -t docx', () => {
    expect(buildPandocArgs('/out/doc.docx', 'docx')).toEqual([
      '-f',
      'markdown',
      '-t',
      'docx',
      '-o',
      '/out/doc.docx',
    ])
  })

  it('builds epub args with -t epub', () => {
    expect(buildPandocArgs('/out/doc.epub', 'epub')).toEqual([
      '-f',
      'markdown',
      '-t',
      'epub',
      '-o',
      '/out/doc.epub',
    ])
  })

  it('builds rtf args with -t rtf (standalone)', () => {
    const args = buildPandocArgs('/out/doc.rtf', 'rtf')
    expect(args).toContain('-t')
    expect(args[args.indexOf('-t') + 1]).toBe('rtf')
    expect(args).toContain('-o')
    expect(args[args.indexOf('-o') + 1]).toBe('/out/doc.rtf')
  })

  it('builds latex args with -t latex', () => {
    const args = buildPandocArgs('/out/doc.tex', 'latex')
    expect(args[args.indexOf('-t') + 1]).toBe('latex')
    expect(args[args.indexOf('-o') + 1]).toBe('/out/doc.tex')
  })

  it('builds opml args with -t opml', () => {
    const args = buildPandocArgs('/out/doc.opml', 'opml')
    expect(args[args.indexOf('-t') + 1]).toBe('opml')
    expect(args[args.indexOf('-o') + 1]).toBe('/out/doc.opml')
  })
})

describe('pandocExtension', () => {
  const cases: { format: PandocFormat; ext: string }[] = [
    { format: 'docx', ext: 'docx' },
    { format: 'epub', ext: 'epub' },
    { format: 'rtf', ext: 'rtf' },
    { format: 'latex', ext: 'tex' },
    { format: 'opml', ext: 'opml' },
  ]

  for (const { format, ext } of cases) {
    it(`maps ${format} -> .${ext}`, () => {
      expect(pandocExtension(format)).toBe(ext)
    })
  }
})

describe('PANDOC_FORMATS', () => {
  it('lists every supported format', () => {
    expect(PANDOC_FORMATS).toEqual(['docx', 'epub', 'rtf', 'latex', 'opml'])
  })
})
