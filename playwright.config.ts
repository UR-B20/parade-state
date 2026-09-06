import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the demo build (VITE_MOCK_API=1): the real API on PGlite in the
 * browser, so no Supabase project is needed. Set E2E_BASE_URL to run against a deployed
 * staging build instead of starting a local server.
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173';

export default defineConfig({
  testDir: 'src/test/e2e',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    // The iPhone profile for size and touch; Chromium because it is what CI and the sandbox have.
    ...devices['iPhone 14'],
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'VITE_MOCK_API=1 pnpm build && pnpm preview --port 4173',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
