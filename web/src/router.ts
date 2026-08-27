/**
 * router.ts - map the current URL to the document(s) to open at launch.
 *
 * The web app is a single page; the path after the origin selects what to open:
 *
 *   /                                 -> nothing (blank welcome document)
 *   /?src=<url>                       -> open any raw markdown URL
 *   /gh/{owner}/{repo}/{ref}/{path}   -> open a GitHub file (short form)
 *   /https://github.com/.../README.md -> open a GitHub file (prefix form)
 *   /<any-other-url>                  -> open that URL
 *
 * It returns synthetic "paths" (usually the resolved URL) that flow through the
 * existing launch-open path in useStartup: takePendingOpen() -> openPath(p) ->
 * readFile(p). The web adapter's readFile fetches http(s) paths, so a URL opens
 * exactly like a file does on the desktop - no parallel code path.
 */
import { expandShortGh, toRawUrl } from './adapter/github'

/** Everything after the origin, tolerating the collapsed `https:/` single slash. */
function targetFromLocation(loc: Location): string | null {
  const src = new URLSearchParams(loc.search).get('src')
  if (src) return src.trim()

  // pathname like "/https://github.com/..." or "/gh/owner/repo/ref/file.md"
  let rest = loc.pathname.replace(/^\/+/, '')
  if (rest === '') return null

  // Some hosts collapse "https://" in a path to "https:/". Repair it.
  rest = rest.replace(/^(https?):\/(?!\/)/i, '$1://')

  if (rest.startsWith('http://') || rest.startsWith('https://')) {
    // Re-attach any query/hash that belonged to the target URL.
    return rest + loc.search + loc.hash
  }

  const segments = rest.split('/').filter(Boolean)
  if (segments[0] === 'gh') {
    const raw = expandShortGh(segments)
    if (raw) return raw
  }
  return null
}

/** Compute the list of synthetic paths to open at launch (usually 0 or 1). */
export function initialOpenPaths(loc: Location = window.location): string[] {
  const target = targetFromLocation(loc)
  if (!target) return []
  return [toRawUrl(target)]
}
