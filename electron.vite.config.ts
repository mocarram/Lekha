import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = {
  '@shared': resolve('src/shared'),
  '@renderer': resolve('src/renderer'),
  '@main': resolve('src/main'),
}

export default defineConfig({
  main: {
    resolve: { alias },
    plugins: [externalizeDepsPlugin()],
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
