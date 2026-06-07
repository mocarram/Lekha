/**
 * openWith.ts
 *
 * Helpers for the "Open With" / double-click / command-line file-open flow.
 *
 * macOS delivers opened files through the `open-file` app event (handled in
 * index.ts). Windows and Linux instead pass the file path as a command-line
 * argument, both on a cold launch (`process.argv`) and when a second instance
 * is started while the app is already running (`second-instance` event). This
 * module turns a raw argv array into the set of files Lekha should actually
 * open: existing, regular files whose extension the editor can read as text.
 *
 * Kept Electron-free and dependency-injected (the `exists` predicate and `cwd`
 * are passed in) so it can be unit-tested without spawning a real app.
 */

/**
 * Extensions Lekha can open as a document tab. Mirrors the renderer's
 * OPENABLE_RE (sidebarDrop.ts) so drag-drop, the sidebar, and OS file-open all
 * agree on what counts as an openable file.
 */
export const OPENABLE_EXT_RE = /\.(md|markdown|mdx|txt|text)$/i

/** Options for {@link markdownPathsFromArgv}. */
export interface ArgvParseOptions {
  /** Absolute working directory used to resolve relative argv paths. */
  cwd: string
  /** Returns true if the resolved absolute path is an existing, openable file. */
  exists: (absPath: string) => boolean
  /** Resolve a (possibly relative) path against cwd to an absolute path. */
  resolve: (cwd: string, p: string) => string
}

/**
 * Extract the openable file paths from a process argv array.
 *
 * Skips: the leading executable (and, in dev, the script entry) argument, any
 * `--flag`/`-x` switches, Chromium/Electron switches, paths whose extension is
 * not openable, and paths that don't resolve to an existing file. Returns
 * absolute paths in argv order, de-duplicated.
 *
 * @param argv - The raw process argument vector (e.g. `process.argv`).
 * @param opts - Injected cwd, path resolver, existence check, and packaged flag.
 */
export function markdownPathsFromArgv(argv: readonly string[], opts: ArgvParseOptions): string[] {
  // argv[0] is the executable. In a packaged app the very next args are the
  // opened files. In dev, argv is `electron . [files]`, so the entry (".",
  // often an absolute path to the project/out dir) must also be skipped - we do
  // this implicitly by requiring an openable extension AND existence, which the
  // directory entry never satisfies.
  const start = 1
  const out: string[] = []
  const seen = new Set<string>()

  for (let i = start; i < argv.length; i++) {
    const arg = argv[i]
    if (typeof arg !== 'string' || arg.length === 0) continue
    // Skip switches: `--foo`, `-f`, and `--foo=bar`.
    if (arg.startsWith('-')) continue
    // Must look like a file Lekha can open.
    if (!OPENABLE_EXT_RE.test(arg)) continue

    const abs = opts.resolve(opts.cwd, arg)
    if (seen.has(abs)) continue
    if (!opts.exists(abs)) continue
    seen.add(abs)
    out.push(abs)
  }

  return out
}
