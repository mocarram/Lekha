import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Plugin that resolves ?raw imports to empty strings during unit tests.
// Vite's built-in ?raw handling is only active in the dev/build server, not
// in the vitest runner. Without this plugin, any import ending in ?raw throws
// "Cannot find module". We return an empty default export so the inlining
// path in buildHtml.ts is exercised structurally (CSS content is tested in
// build/e2e; unit tests assert HTML structure, not CSS values).
const rawImportStub: Plugin = {
  name: 'raw-import-stub',
  resolveId(id: string) {
    if (id.endsWith('?raw')) return '\0' + id
    return null
  },
  load(id: string) {
    if (id.startsWith('\0') && id.endsWith('?raw')) return 'export default ""'
    return null
  },
}

export default defineConfig({
  plugins: [rawImportStub, react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer'),
      '@main': resolve('src/main'),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts?(x)'],
  },
})
