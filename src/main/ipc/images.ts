/**
 * IPC handler for saving pasted/dropped images to disk.
 *
 * Design:
 * - When the document has a saved path, images are written into an `assets/`
 *   subfolder next to the document. A POSIX-relative path `assets/<filename>`
 *   is returned so the Markdown stays portable (moving just the doc + assets
 *   folder keeps links intact).
 * - When the document is unsaved, images are written into the OS user-data
 *   directory under `images/`. An absolute `file://` URI is returned so
 *   the Electron renderer can display the image even though the doc has no
 *   known location yet.
 *
 * Unique filenames are derived deterministically from a monotone module counter
 * (zero-padded to 6 digits) rather than Date.now / Math.random, so tests are
 * stable and filenames are predictable.
 */

import { ipcMain } from 'electron'
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join, posix } from 'node:path'
import { IPC } from '@shared/ipc-channels'

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested without any filesystem access)
// ---------------------------------------------------------------------------

/** Map common image MIME types to their canonical file extension. */
export function extFromMime(mime: string): string {
  const clean = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/avif': 'avif',
    'image/heic': 'heic',
  }
  return map[clean] ?? 'png'
}

/** Zero-pad a number to at least `width` digits. */
function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

export interface ImageTarget {
  /** Absolute filesystem directory to write the image into. */
  dir: string
  /** Filename component only (e.g. `image-000001.png`). */
  filename: string
  /**
   * The path to insert into Markdown:
   * - Saved doc: POSIX relative `assets/<filename>` (no leading slash).
   * - Unsaved doc: absolute `file:///…` URI so the renderer can display it.
   */
  insertPath: string
}

/**
 * Pure resolver - no I/O.
 *
 * @param docPath  Absolute path of the current document, or null when unsaved.
 * @param ext      File extension without leading dot (e.g. `png`).
 * @param counter  Monotone counter used to build a unique filename.
 * @param userData Absolute path to the Electron user-data directory.
 */
export function resolveImageTarget(
  docPath: string | null,
  ext: string,
  counter: number,
  userData: string,
): ImageTarget {
  const filename = `image-${zeroPad(counter, 6)}.${ext}`

  if (docPath !== null) {
    // Document is saved - use an assets/ sibling folder.
    const dir = join(dirname(docPath), 'assets')
    // POSIX forward-slashes for Markdown portability across platforms.
    const insertPath = posix.join('assets', filename)
    return { dir, filename, insertPath }
  }

  // Document is unsaved - write to the user-data images folder so the image
  // persists even after the app is closed without saving.
  const dir = join(userData, 'images')
  const absPath = join(dir, filename)
  // Convert to a file:// URI so the Electron renderer can load it from the
  // sandboxed renderer process (absolute paths are blocked by CSP in some
  // configs; file:// URIs are always allowed for local resources).
  const insertPath = `file://${absPath.replace(/\\/g, '/')}`
  return { dir, filename, insertPath }
}

// ---------------------------------------------------------------------------
// Module-level write counter
// ---------------------------------------------------------------------------

let _counter = 0

/** Reset the counter (used only in tests to ensure isolation). */
export function _resetCounter(): void {
  _counter = 0
}

// ---------------------------------------------------------------------------
// Filesystem write helper (thin wrapper around the pure resolver + fs I/O)
// ---------------------------------------------------------------------------

export interface SaveImageArgs {
  data: ArrayBuffer | Uint8Array
  ext: string
  docPath: string | null
}

export interface SaveImageResult {
  insertPath: string
}

/**
 * Write image bytes to disk and return the path to insert into Markdown.
 *
 * If the computed filename already exists (counter collision), the counter is
 * bumped until a free slot is found - defensive, very rare in practice.
 */
export async function saveImageToDisk(
  args: SaveImageArgs,
  userData: string,
): Promise<SaveImageResult> {
  const { data, ext, docPath } = args

  let target: ImageTarget
  let finalPath: string

  // Find a free filename slot.
  for (;;) {
    _counter += 1
    target = resolveImageTarget(docPath, ext, _counter, userData)
    finalPath = join(target.dir, target.filename)

    const exists = await access(finalPath)
      .then(() => true)
      .catch(() => false)

    if (!exists) break
    // Slot taken - bump and retry.
  }

  await mkdir(target.dir, { recursive: true })

  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data instanceof ArrayBuffer ? data : Buffer.from(data))

  await writeFile(finalPath, bytes)

  return { insertPath: target.insertPath }
}

// ---------------------------------------------------------------------------
// IPC registration
// ---------------------------------------------------------------------------

/**
 * Register the `fs:saveImage` IPC handler.
 *
 * @param getUserDataPath  Supplier for the Electron user-data path, injected
 *   so that index.ts can pass `() => app.getPath('userData')` at runtime while
 *   tests can inject a temp directory.
 */
export function registerImageHandlers(getUserDataPath: () => string): void {
  ipcMain.handle(IPC.saveImage, async (_event, args: SaveImageArgs) => {
    try {
      return await saveImageToDisk(args, getUserDataPath())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(msg, { cause: err })
    }
  })
}
