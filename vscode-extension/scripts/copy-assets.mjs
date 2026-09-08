/**
 * copy-assets.mjs — vendors the static assets the webview links to.
 *
 * KaTeX renders math to HTML in the extension host, but that HTML needs
 * katex.min.css (and its font files) present in the webview to display
 * correctly, so we copy both into media/vendor/.
 *
 * We do NOT vendor a highlight.js stylesheet: Lekha's github.css/night.css
 * already colour hljs tokens through design tokens, so the code themes follow
 * the active Lekha theme automatically.
 */
import { existsSync, mkdirSync, copyFileSync, cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(pathToFileURL(join(__dirname, 'package.json')))

const vendorDir = join(__dirname, '..', 'media', 'vendor')
mkdirSync(vendorDir, { recursive: true })

// Resolve KaTeX's package location without hardcoding node_modules layout.
const katexDist = dirname(require.resolve('katex/dist/katex.min.css'))

// 1. katex.min.css
copyFileSync(join(katexDist, 'katex.min.css'), join(vendorDir, 'katex.min.css'))

// 2. KaTeX fonts (katex.min.css references them via url(fonts/…))
const fontsSrc = join(katexDist, 'fonts')
if (existsSync(fontsSrc)) {
  cpSync(fontsSrc, join(vendorDir, 'fonts'), { recursive: true })
} else {
  console.warn('[copy-assets] KaTeX fonts folder not found at', fontsSrc)
}

console.log('[copy-assets] vendored KaTeX css + fonts into media/vendor/')
