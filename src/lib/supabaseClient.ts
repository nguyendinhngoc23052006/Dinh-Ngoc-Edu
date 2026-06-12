import { createClient } from '@supabase/supabase-js'

// VITE_ names are set by hand in Vercel (Production); the Supabase↔Vercel
// integration injects preview values under its fixed NEXT_PUBLIC_ names.
const url =
  import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Missing Supabase config: set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the NEXT_PUBLIC_ names the Supabase integration injects).',
  )
}

export const supabase = createClient(url, key)
