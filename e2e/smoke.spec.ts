import { expect, test } from '@playwright/test'
import { mockSupabase } from './_mocks'

// Network-light smoke flows that unit tests can't catch: real routing, real
// rendering, real client-side guards — all against a mocked Supabase.
test.beforeEach(async ({ page }) => {
  await mockSupabase(page)
})

test('landing page renders', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', {
      name: 'Turn your notes into a game you can win.',
    }),
  ).toBeVisible()
})

test('client-side validation error shows with no network', async ({ page }) => {
  await page.goto('/')
  // Submit the upload form with an empty title: validateNewCourse rejects it
  // in the browser, before any request leaves the page.
  await page.getByRole('button', { name: 'Generate course' }).click()
  await expect(page.getByText('Give the course a title.')).toBeVisible()
})

test('logged-out visit to a gated route redirects to login', async ({
  page,
}) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible()
})
