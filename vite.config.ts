import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // The Supabase→Vercel integration injects preview vars under fixed
  // NEXT_PUBLIC_ names; Vite must expose them to the browser too.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
