// @vitest-environment node
/**
 * Tests for injectExportCsp (src/main/ipc/export.ts).
 *
 * The exported / printed HTML must carry a `script-src 'none'` CSP meta so the
 * offscreen print window (and any program later opening the .html file) can never
 * execute embedded JS. Math/mermaid are pre-rendered to static SVG/HTML, so no
 * export feature relies on script.
 */
import { describe, it, expect } from 'vitest'
import { injectExportCsp } from '@main/ipc/export'

describe('injectExportCsp', () => {
  it("inserts a script-src 'none' CSP meta right after <head>", () => {
    const html = '<!DOCTYPE html>\n<html>\n<head>\n  <title>x</title>\n</head>\n<body></body>\n</html>'
    const out = injectExportCsp(html)
    expect(out).toContain(`<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`)
    // The meta lands inside <head>, before the title.
    const headIdx = out.indexOf('<head>')
    const metaIdx = out.indexOf('Content-Security-Policy')
    const titleIdx = out.indexOf('<title>')
    expect(headIdx).toBeLessThan(metaIdx)
    expect(metaIdx).toBeLessThan(titleIdx)
  })

  it('handles a <head> with attributes', () => {
    const html = '<head lang="en"><title>t</title></head>'
    const out = injectExportCsp(html)
    expect(out).toContain('Content-Security-Policy')
    expect(out.startsWith('<head lang="en">')).toBe(true)
  })

  it('returns the input unchanged when there is no <head>', () => {
    const html = '<div>fragment only</div>'
    expect(injectExportCsp(html)).toBe(html)
  })

  it('injects only once (single head match)', () => {
    const html = '<head></head>'
    const out = injectExportCsp(html)
    const count = out.split('Content-Security-Policy').length - 1
    expect(count).toBe(1)
  })
})
