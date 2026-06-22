import type { Page } from '@playwright/test'

// Intercept every request to the stub Supabase host with deterministic
// defaults so the suite is fully offline: no session, empty result sets.
// Anything not explicitly matched still gets a safe empty-JSON answer rather
// than escaping to the network.
const STUB_HOST = 'https://stub.supabase.co'

export async function mockSupabase(page: Page): Promise<void> {
  await page.route(`${STUB_HOST}/**`, async (route) => {
    const url = route.request().url()
    // Auth: no current user / session.
    if (url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{}',
      })
    }
    // REST tables: empty list.
    if (url.includes('/rest/v1/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      })
    }
    // Everything else on the stub host: empty object.
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })
}
