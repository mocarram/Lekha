import { defineConfig } from '@playwright/test'

// Critical-flow E2E tests drive the packaged Electron app via Playwright's
// Electron support. These require a built app (npm run build) and a display
// server, so they are excluded from headless CI by default.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
  },
})
