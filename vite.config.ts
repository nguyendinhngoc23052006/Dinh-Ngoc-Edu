import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // The Supabase→Vercel integration injects preview vars under fixed
  // NEXT_PUBLIC_ names; Vite must expose them to the browser too.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  test: {
    // The e2e/ folder is Playwright (its own runner); keep Vitest out of it —
    // its *.spec.ts files import @playwright/test, which Vitest can't run.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Edge Function code imports Deno npm: specifiers; alias them to the same
    // packages (dev mirrors pinned to the SAME versions as the npm: strings in
    // supabase/functions — keep them in lockstep) so vitest can test the pure
    // extraction logic without Deno.
    alias: {
      'npm:fflate@0.8.2': 'fflate',
      'npm:unpdf@0.12.1': 'unpdf',
    },
    coverage: {
      // Signal for the human at review time (CI job summary), never a gate —
      // thresholds breed test theater.
      reporter: ['text-summary'],
    },
  },
})
