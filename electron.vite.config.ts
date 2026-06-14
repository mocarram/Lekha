import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer'),
  '@main': resolve('src/main'),
}

// Update channel baked at build time (see src/shared/updateChannel.ts). A
// packaged app has no env to read, so the CI/Homebrew build leaves this unset
// (-> 'homebrew', electron-updater dormant); a future signed direct-download
// build sets LEKHA_UPDATE_CHANNEL=direct to enable real auto-update.
const updateChannelDefine = {
  __UPDATE_CHANNEL__: JSON.stringify(process.env['LEKHA_UPDATE_CHANNEL'] ?? 'homebrew'),
}

// Packaging rule: externalizeDepsPlugin keeps everything in package.json
// "dependencies" UNBUNDLED and ships it as node_modules inside the asar. Main
// and preload only import `electron-updater` from npm, so that is the sole
// runtime dependency; every renderer library is bundled into out/ by vite and
// belongs in devDependencies (listing one in "dependencies" ships it TWICE).

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    define: updateChannelDefine,
    build: {
      rollupOptions: {
        input: { index: resolve('src/main/index.ts') },
      },
    },
  },
  preload: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preloads must be CommonJS; emit .cjs so Node does not
        // treat it as ESM under the package's "type": "module".
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
    build: {
      // The heavy vendors (katex, mermaid, codemirror) are now split into their
      // own chunks and lazy-loaded on demand, so the entry chunk is far smaller.
      // Bump the warning limit so the legitimately large (but lazy) vendor
      // chunks - e.g. mermaid's diagram bundles - don't spam warnings.
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html') },
        output: {
          // Split big vendors into their own chunks. Eager ones (react,
          // prosemirror) stay cacheable across releases; lazy ones (katex,
          // mermaid, codemirror) are only fetched when math/diagram/source mode
          // is first used, keeping them out of the initial entry chunk.
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('katex')) return 'katex'
              if (id.includes('mermaid')) return 'mermaid'
              if (id.includes('@codemirror') || id.includes('@lezer')) {
                return 'codemirror'
              }
              if (id.includes('prosemirror')) return 'prosemirror'
              if (id.includes('lowlight') || id.includes('highlight.js')) {
                return 'highlight'
              }
            }
            return undefined
          },
        },
      },
    },
  },
})
