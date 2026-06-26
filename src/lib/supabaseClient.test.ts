import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

test('creates a client from URL + publishable key', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  const { supabase } = await import('./supabaseClient')
  expect(supabase).toBeDefined()
})

test('falls back to VITE_SUPABASE_ANON_KEY when publishable key is absent', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_anon_test')
  const { supabase } = await import('./supabaseClient')
  expect(supabase).toBeDefined()
})

test('throws when the key is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
  await expect(import('./supabaseClient')).rejects.toThrow(
    /Missing Supabase config/,
  )
})

test('throws when the URL is missing', async () => {
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  await expect(import('./supabaseClient')).rejects.toThrow(
    /Missing Supabase config/,
  )
})
