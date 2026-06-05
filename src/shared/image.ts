/**
 * Shared image utilities used by both main-process and renderer code.
 */

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
