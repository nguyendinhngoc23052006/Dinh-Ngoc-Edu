import { defineConfig, devices } from '@playwright/test'

// Mocked-network E2E gate: the app is built against a STUB Supabase it never
// reaches (e2e/_mocks.ts intercepts every request to it), so the suite is
// deterministic and needs no preview database or secret. Keep it that way.
const PORT = 4173
const STUB_SUPABASE_URL = 'https://stub.supabase.co'
const STUB_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_stub'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Build with the stub env inlined so the bundle has config but reaches
    // nothing real, then serve the static preview on a fixed port.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: STUB_SUPABASE_URL,
      VITE_SUPABASE_PUBLISHABLE_KEY: STUB_SUPABASE_PUBLISHABLE_KEY,
    },
  },
})
