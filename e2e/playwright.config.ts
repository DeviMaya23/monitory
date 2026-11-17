// End-to-end journeys of Monitory, run against the real binary.
//
// Run from the repository root (both build the frontend first, then start Mailpit):
//   make test-e2e-smoke   Chromium, tests tagged @smoke
//   make test-e2e         the full suite in Chromium, Firefox and WebKit
// `make build` must come first: the binary embeds backend/internal/web/dist.
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './journeys',
  globalSetup: './support/globalSetup.ts',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
})
