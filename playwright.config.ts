import { defineConfig } from '@playwright/test'

// Critical-flow E2E tests drive the packaged Electron app via Playwright's
// Electron support. These require a built app (npm run build) and a display
// server, so they are excluded from headless CI by default.
//
// Run order: npm run build && npm run test:e2e
// (or use `npm run test:e2e:full` which runs build first via the pretest hook)
export default defineConfig({
  testDir: './tests/e2e',
  // Per-test timeout — Electron launch can take several seconds on first run.
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    trace: 'on-first-retry',
    // Action timeout for individual Playwright assertions/actions
    actionTimeout: 15_000,
  },
})
