/**
 * smoke.mjs — verifies the host renderer produces the expected HTML.
 * Bundled+run via: node scripts/smoke.mjs
 */
import * as esbuild from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { writeFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

// Bundle just the renderer (no 'vscode' dependency) into CJS and require it.
const result = await esbuild.build({
  entryPoints: [join(root, 'src/renderer.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  write: false,
})
const tmp = join(tmpdir(), `lekha-renderer-${Date.now()}.cjs`)
writeFileSync(tmp, result.outputFiles[0].text)
const { renderMarkdown } = require(tmp)
rmSync(tmp, { force: true })

const sample = `---
title: Test
---

# Hello

Inline math $E=mc^2$ and display:

$$
\\int_0^1 x\\,dx
$$

\`\`\`js
const x = 1
\`\`\`

\`\`\`mermaid
graph TD; A-->B
\`\`\`

| a | b |
|---|---|
| 1 | 2 |

- [x] done
- [ ] todo

![pic](./img/cat.png)
`

const { html } = renderMarkdown(sample, (rel) => `WEBVIEW_URI(${rel})`)

const checks = [
  ['front-matter stripped', !html.includes('title: Test')],
  ['heading', html.includes('<h1>Hello</h1>')],
  ['inline KaTeX', html.includes('katex') && html.includes('E')],
  ['display KaTeX', html.includes('katex-display') || html.includes('displaystyle')],
  ['hljs code', html.includes('class="hljs')],
  ['mermaid fence → pre.mermaid', html.includes('<pre class="mermaid">graph TD')],
  ['table', html.includes('<table>')],
  ['task list', html.includes('type="checkbox"')],
  ['relative image resolved', html.includes('WEBVIEW_URI(./img/cat.png)')],
]

let ok = true
for (const [name, pass] of checks) {
  console.log(`${pass ? '✓' : '✗'} ${name}`)
  if (!pass) ok = false
}
if (!ok) {
  console.error('\n--- rendered HTML ---\n' + html)
  process.exit(1)
}
console.log('\nAll renderer smoke checks passed.')
