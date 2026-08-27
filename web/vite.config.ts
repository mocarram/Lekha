import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web app reuses the desktop renderer in place (src/renderer + src/shared)
// via the same aliases the Electron build uses. Only the platform adapter
// (window.lekha) differs - it is provided by web/src/adapter instead of the
// Electron preload bridge.
const repoRoot = resolve(__dirname, '..')

export default defineConfig({
  root: __dirname,
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(repoRoot, 'src/shared'),
      '@renderer': resolve(repoRoot, 'src/renderer'),
    },
  },
  server: {
    // Allow importing the renderer/shared sources that live above web/.
    fs: { allow: [repoRoot] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Mirror the desktop build's vendor splitting: keep the heavy, lazily
        // used libraries (katex, mermaid, codemirror) out of the entry chunk.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('katex')) return 'katex'
            if (id.includes('mermaid')) return 'mermaid'
            if (id.includes('@codemirror') || id.includes('@lezer')) return 'codemirror'
            if (id.includes('prosemirror')) return 'prosemirror'
            if (id.includes('lowlight') || id.includes('highlight.js')) return 'highlight'
          }
          return undefined
        },
      },
    },
  },
})
