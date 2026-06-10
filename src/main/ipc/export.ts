/**
 * export.ts - Main-process IPC handlers for document export.
 *
 * Three export paths:
 *
 *   exportHtml  - Receives a rendered HTML string from the renderer.
 *                 Shows a .html save dialog and writes the file to disk.
 *                 Pure file write; no additional processing needed.
 *
 *   exportPdf   - Receives a rendered HTML string from the renderer.
 *                 Creates an OFFSCREEN BrowserWindow (show:false), loads the
 *                 HTML via a temporary file (more robust than data: URLs for
 *                 large documents), waits for the 'did-finish-load' event,
 *                 calls webContents.printToPDF({ printBackground:true,
 *                 pageSize:'A4' }), writes the resulting Buffer to the path
 *                 chosen by a .pdf save dialog, then destroys the offscreen
 *                 window.
 *
 *                 Offscreen window notes:
 *                   - sandbox:false is required for printToPDF to work in
 *                     Electron's renderer process sandbox.
 *                   - The window is always destroyed in a finally block even
 *                     if printToPDF or the save dialog fail.
 *                   - The temp file is removed after the PDF is written.
 *
 *   exportPandoc - Detects pandoc availability (cached after first check).
 *                 Receives the raw markdown string plus a target `format`
 *                 (docx/epub/rtf/latex/opml). Shows a save dialog with the
 *                 format's extension/filter, then spawns
 *                 `pandoc -f markdown -t <writer> [--standalone] -o <outPath>`
 *                 and pipes the markdown to stdin. Rejects with a user-friendly
 *                 message if pandoc is absent.
 *
 *   pandocAvailable - Returns a boolean. Cached on first call so repeated menu
 *                     queries do not spawn a new process each time.
 *
 * None of these handlers are unit-tested (they require Electron's BrowserWindow
 * and dialog APIs, and child_process.spawn - all Electron-bound). The
 * pandoc argument builder `buildPandocArgs` is a pure helper that IS testable.
 */

import { BrowserWindow, dialog } from 'electron'
import { guardedIpc } from '@main/ipcGuard'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { IPC } from '@shared/ipc-channels'
import type { PandocFormat } from '@shared/types'
import { PANDOC_EXTENSIONS } from '@shared/pandocFormats'
import { hardenWebContents } from '@main/window'
import { senderWindow } from '@main/senderWindow'

// ---------------------------------------------------------------------------
// Exported-HTML Content-Security-Policy
// ---------------------------------------------------------------------------

/**
 * CSP meta tag injected into the <head> of every exported / printed HTML
 * document. The export pipeline pre-renders math (KaTeX) and mermaid diagrams to
 * static SVG/HTML, so neither the printed PDF nor an exported .html file needs to
 * execute script. `script-src 'none'` guarantees the offscreen print window (and
 * any program later opening the exported file) can never run embedded JS, even if
 * a script somehow slipped past the renderer's sanitizer. This is independent of
 * the app's own renderer CSP (index.ts) and changes no sandbox settings.
 */
const EXPORT_CSP_META =
  `<meta http-equiv="Content-Security-Policy" content="script-src 'none'">`

/**
 * Insert the export CSP meta tag so the exported / printed document can never
 * execute embedded script. FAIL CLOSED: if the HTML has no <head> (the renderer
 * always emits one, but we must not depend on that), we synthesize one rather
 * than returning the HTML unprotected - the previous behaviour silently dropped
 * the only script CSP when <head> was absent.
 */
export function injectExportCsp(html: string): string {
  // Normal path: insert right after the existing <head> open tag.
  const headMatch = /<head[^>]*>/i.exec(html)
  if (headMatch) {
    const insertAt = headMatch.index + headMatch[0].length
    return html.slice(0, insertAt) + '\n  ' + EXPORT_CSP_META + html.slice(insertAt)
  }
  // No <head>: synthesize one carrying the CSP, immediately after <html> if
  // present, otherwise prepended so the meta still governs the whole document.
  const htmlMatch = /<html[^>]*>/i.exec(html)
  if (htmlMatch) {
    const insertAt = htmlMatch.index + htmlMatch[0].length
    return html.slice(0, insertAt) + `\n<head>\n  ${EXPORT_CSP_META}\n</head>` + html.slice(insertAt)
  }
  return `<head>\n  ${EXPORT_CSP_META}\n</head>\n` + html
}

// ---------------------------------------------------------------------------
// Pandoc detection (cached)
// ---------------------------------------------------------------------------

/** Cached pandoc availability - null means "not yet checked". */
let pandocAvailableCache: boolean | null = null

/**
 * Check if `pandoc` is on the system PATH.
 *
 * Runs `pandoc --version` and resolves true on exit code 0, false otherwise.
 * The result is cached so the check only runs once per process lifetime.
 */
async function checkPandocAvailable(): Promise<boolean> {
  if (pandocAvailableCache !== null) return pandocAvailableCache

  return new Promise<boolean>((resolve) => {
    const proc = spawn('pandoc', ['--version'], { stdio: 'ignore' })
    proc.on('error', () => {
      pandocAvailableCache = false
      resolve(false)
    })
    proc.on('exit', (code) => {
      pandocAvailableCache = code === 0
      resolve(pandocAvailableCache)
    })
  })
}

// ---------------------------------------------------------------------------
// Pure pandoc arg builder (testable without Electron)
// ---------------------------------------------------------------------------

/**
 * Supported pandoc export formats. The key is the logical format used across
 * the renderer/menu/commands; each maps to a pandoc writer (`-t`) value and an
 * output file extension below.
 */
export const PANDOC_FORMATS: readonly PandocFormat[] = [
  'docx',
  'epub',
  'rtf',
  'latex',
  'opml',
]

export type { PandocFormat }

/**
 * Per-format metadata: the pandoc writer name (`-t <writer>`), the output file
 * extension, the save-dialog filter label, and whether the writer needs the
 * `--standalone` flag to produce a complete (rather than fragment) document.
 *
 * Most binary/container writers (docx, epub, opml) are inherently standalone;
 * the text writers (rtf, latex) need `--standalone` so the file is a complete
 * document with the proper preamble rather than a body fragment.
 */
interface PandocFormatMeta {
  writer: string
  extension: string
  filterName: string
  standalone: boolean
}

// The output extension for each format comes from the shared PANDOC_EXTENSIONS
// map (@shared/pandocFormats) so main and the renderer never drift; only the
// pandoc-specific writer/filter/standalone metadata is defined here.
const PANDOC_META: Record<PandocFormat, PandocFormatMeta> = {
  docx: { writer: 'docx', extension: PANDOC_EXTENSIONS.docx, filterName: 'Word Documents', standalone: false },
  epub: { writer: 'epub', extension: PANDOC_EXTENSIONS.epub, filterName: 'EPUB Books', standalone: false },
  rtf: { writer: 'rtf', extension: PANDOC_EXTENSIONS.rtf, filterName: 'Rich Text Format', standalone: true },
  latex: { writer: 'latex', extension: PANDOC_EXTENSIONS.latex, filterName: 'LaTeX Source', standalone: true },
  opml: { writer: 'opml', extension: PANDOC_EXTENSIONS.opml, filterName: 'OPML Outlines', standalone: false },
}

/**
 * Build the pandoc argument array for a markdown -> <format> conversion.
 *
 * Pure function; does not touch the filesystem or spawn anything.
 * Extracted so it can be tested independently (the handler itself is
 * Electron-bound and not unit-tested).
 *
 * @param outPath - Absolute path to write the output to.
 * @param format  - Target pandoc format.
 * @returns Array of CLI arguments to pass to `pandoc`.
 */
export function buildPandocArgs(outPath: string, format: PandocFormat): string[] {
  const meta = PANDOC_META[format]
  const args = ['-f', 'markdown', '-t', meta.writer]
  if (meta.standalone) args.push('--standalone')
  args.push('-o', outPath)
  return args
}

// ---------------------------------------------------------------------------
// IPC handler registration
// ---------------------------------------------------------------------------

/** Register all export IPC handlers. Save dialogs and the offscreen PDF parent
 *  are derived from the IPC event sender (the calling window). */
export function registerExportHandlers(): void {
  // -------------------------------------------------------------------------
  // export:html
  // -------------------------------------------------------------------------

  guardedIpc.handle(
    IPC.exportHtml,
    async (event, args: { html: string; suggestedName: string }): Promise<void> => {
      const win = senderWindow(event)
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: args.suggestedName,
        filters: [{ name: 'HTML Files', extensions: ['html'] }],
      })

      if (result.canceled || !result.filePath) return

      // Inject a script-blocking CSP so the exported file can never run JS.
      await writeFile(result.filePath, injectExportCsp(args.html), 'utf-8')
    },
  )

  // -------------------------------------------------------------------------
  // export:pdf
  //
  // Offscreen BrowserWindow flow:
  //   1. Write the HTML to a temp file (avoids data: URL length limits and
  //      ensures relative resources inside the HTML work if any exist).
  //   2. Create a hidden BrowserWindow with sandbox:false (required for
  //      printToPDF to function correctly in Electron).
  //   3. Load the temp file via loadFile() and await 'did-finish-load'.
  //   4. Call printToPDF({ printBackground:true, pageSize:'A4' }).
  //   5. Show the save dialog and write the PDF Buffer to disk.
  //   6. Destroy the offscreen window and delete the temp file (finally).
  // -------------------------------------------------------------------------

  guardedIpc.handle(
    IPC.exportPdf,
    async (event, args: { html: string; suggestedName: string }): Promise<void> => {
      // Write HTML to a temp file so loadFile() can read it (data: URLs have
      // length limits that cause problems with large, CSS-inlined documents).
      const tmpPath = join(tmpdir(), `lekha-export-${Date.now()}.html`)
      // Inject a script-blocking CSP so the offscreen print window can never
      // execute embedded JS (printed output never needs script).
      await writeFile(tmpPath, injectExportCsp(args.html), 'utf-8')

      // Create the offscreen window. sandbox:false is required for printToPDF
      // to work - with sandbox:true Electron cannot access the printer backend.
      // Keep the rest locked down: no node integration, context isolation on.
      const offscreen = new BrowserWindow({
        show: false,
        width: 1200,
        height: 900,
        webPreferences: {
          sandbox: false,
          nodeIntegration: false,
          contextIsolation: true,
        },
      })

      // Defense-in-depth: the export HTML is sanitized in the renderer
      // (buildHtml.ts), but harden this window too so that even if a script
      // slipped through it can neither open a child window nor navigate the
      // frame away from the temp document we loaded. The allowed navigation
      // target is the temp file's own URL; everything else is blocked.
      hardenWebContents(offscreen.webContents, `file://${tmpPath}`)

      try {
        // Load the temp HTML and wait for the page to finish rendering.
        await new Promise<void>((resolve, reject) => {
          offscreen.webContents.once('did-finish-load', resolve)
          offscreen.webContents.once('did-fail-load', (_e, code, desc) => {
            reject(new Error(`Failed to load export HTML: ${desc} (${code})`))
          })
          void offscreen.loadFile(tmpPath)
        })

        // Render the page to a PDF buffer.
        const pdfBuffer = await offscreen.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          margins: { marginType: 'default' },
        })

        // Ask the user where to save the PDF (modal to the calling window).
        const win = senderWindow(event)
        const result = await dialog.showSaveDialog(win!, {
          defaultPath: args.suggestedName,
          filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
        })

        if (result.canceled || !result.filePath) return

        await writeFile(result.filePath, pdfBuffer)
      } finally {
        // Always clean up: destroy the offscreen window and remove the temp file.
        offscreen.destroy()
        await unlink(tmpPath).catch(() => { /* ignore if already gone */ })
      }
    },
  )

  // -------------------------------------------------------------------------
  // export:pandoc (generalized markdown -> docx/epub/rtf/latex/opml)
  //
  // Pandoc flow (format-parameterized):
  //   1. Check pandoc availability (cached).
  //   2. Show the save dialog with the format's filter/extension.
  //   3. Spawn `pandoc -f markdown -t <writer> [...] -o <outPath>` and pipe the
  //      markdown to stdin, then close stdin to signal EOF.
  //   4. Collect stderr; on non-zero exit, reject with the stderr text.
  //
  // The previous `export:docx` channel is routed through this handler with
  // format 'docx' (see preload) so existing callers keep working unchanged.
  // -------------------------------------------------------------------------

  guardedIpc.handle(
    IPC.exportPandoc,
    async (
      event,
      args: { markdown: string; suggestedName: string; format: PandocFormat },
    ): Promise<void> => {
      const available = await checkPandocAvailable()
      if (!available) {
        throw new Error(
          'Pandoc is not installed. Install pandoc (https://pandoc.org) to enable this export.',
        )
      }

      const meta = PANDOC_META[args.format]
      const win = senderWindow(event)
      const result = await dialog.showSaveDialog(win!, {
        defaultPath: args.suggestedName,
        filters: [{ name: meta.filterName, extensions: [meta.extension] }],
      })

      if (result.canceled || !result.filePath) return

      const outPath = result.filePath
      const pandocArgs = buildPandocArgs(outPath, args.format)

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('pandoc', pandocArgs, { stdio: ['pipe', 'ignore', 'pipe'] })
        const stderrChunks: Buffer[] = []

        proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk))

        proc.on('error', (err) => {
          reject(new Error(`Failed to spawn pandoc: ${err.message}`))
        })

        // If pandoc exits early (e.g. bad input), writing to its stdin emits an
        // EPIPE 'error' on the stream. Without a listener that becomes an
        // unhandled stream error; mirror the spawn-error rejection so a broken
        // pipe rejects the promise cleanly instead.
        proc.stdin?.on('error', (err) => {
          reject(new Error(`Failed to write to pandoc stdin: ${err.message}`))
        })

        proc.on('exit', (code) => {
          if (code === 0) {
            resolve()
          } else {
            const stderr = Buffer.concat(stderrChunks).toString('utf-8').trim()
            reject(new Error(`pandoc exited with code ${code}: ${stderr}`))
          }
        })

        // Write markdown to stdin and close to signal EOF.
        proc.stdin?.write(args.markdown, 'utf-8')
        proc.stdin?.end()
      })
    },
  )

  // -------------------------------------------------------------------------
  // export:pandocAvailable
  // -------------------------------------------------------------------------

  guardedIpc.handle(IPC.pandocAvailable, async (): Promise<boolean> => {
    return checkPandocAvailable()
  })
}
