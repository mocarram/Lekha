/**
 * esbuild.mjs — bundles two targets:
 *
 *   1. The extension host (Node/CommonJS) → out/extension.js
 *      Runs in VS Code's extension host. markdown-it, KaTeX and highlight.js
 *      all run here (plain Node), so they are bundled in.
 *
 *   2. The webview client (browser/IIFE) → media/webview.js
 *      Runs inside the webview's sandboxed iframe. DOMPurify and Mermaid are
 *      bundled here because they need a real DOM. Mermaid in particular can
 *      only produce SVG in a browser context, which the extension host lacks.
 */
import * as esbuild from 'esbuild'

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const common = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
}

const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  // 'vscode' is provided by the host at runtime and must never be bundled.
  external: ['vscode'],
}

const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/client.ts'],
  outfile: 'media/webview.js',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
}

async function run() {
  if (watch) {
    const ctxA = await esbuild.context(extensionConfig)
    const ctxB = await esbuild.context(webviewConfig)
    await Promise.all([ctxA.watch(), ctxB.watch()])
    console.log('[esbuild] watching…')
  } else {
    await Promise.all([esbuild.build(extensionConfig), esbuild.build(webviewConfig)])
    console.log('[esbuild] build complete')
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
