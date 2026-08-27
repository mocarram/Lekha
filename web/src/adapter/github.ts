/**
 * github.ts - turn a pasted GitHub (or arbitrary) URL into a fetchable raw
 * Markdown URL, and fetch it.
 *
 * Supported inputs:
 *   https://github.com/{owner}/{repo}/blob/{ref}/{path}   (the common case)
 *   https://github.com/{owner}/{repo}/raw/{ref}/{path}
 *   https://raw.githubusercontent.com/...                 (already raw)
 *   gh/{owner}/{repo}/{ref}/{path}                        (short form, see router)
 *   any other http(s) URL                                 (generic raw markdown)
 *
 * Public files fetch straight from the browser: raw.githubusercontent.com sends
 * `Access-Control-Allow-Origin: *`. Private repos and rate-limited requests are
 * a later phase (a serverless proxy at /api/gh); for now they surface a clear
 * error rather than silently failing.
 */

/** Rewrite a github.com blob/raw URL to its raw.githubusercontent.com form. */
export function toRawUrl(input: string): string {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return input
  }

  if (url.hostname === 'github.com') {
    // /{owner}/{repo}/(blob|raw)/{ref}/{...path}
    const parts = url.pathname.split('/').filter(Boolean)
    const kind = parts[2]
    if ((kind === 'blob' || kind === 'raw') && parts.length >= 5) {
      const owner = parts[0]
      const repo = parts[1]
      const ref = parts[3]
      const path = parts.slice(4).join('/')
      return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`
    }
  }
  return url.toString()
}

/** Expand the short `gh/{owner}/{repo}/{ref}/{path}` form to a raw URL. */
export function expandShortGh(segments: string[]): string | null {
  // segments = ['gh', owner, repo, ref, ...path]
  if (segments[0] !== 'gh' || segments.length < 5) return null
  const [, owner, repo, ref, ...rest] = segments
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join('/')}`
}

/** Fetch a remote document, mapping HTTP failures to readable messages. */
export async function fetchRemote(input: string): Promise<string> {
  const raw = toRawUrl(input)
  let res: Response
  try {
    res = await fetch(raw, { redirect: 'follow' })
  } catch (err) {
    throw new Error(
      `Could not reach ${raw}. The server may block cross-origin requests (CORS), ` +
        `or you may be offline.\n(${err instanceof Error ? err.message : String(err)})`,
      { cause: err },
    )
  }
  if (res.status === 404) {
    throw new Error(
      `Not found (404): ${raw}\nIf this is a private repository, private access ` +
        `is coming in a later phase.`,
    )
  }
  if (res.status === 403) {
    throw new Error(`Access denied or rate-limited (403): ${raw}`)
  }
  if (!res.ok) {
    throw new Error(`Failed to load (${res.status} ${res.statusText}): ${raw}`)
  }
  return res.text()
}
