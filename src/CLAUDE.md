# src/ — local wiring

- Components render UI only; data access and server-side validation live in `src/services/` (create it with the first feature).
- All Supabase access goes through `src/lib/supabaseClient.ts` — never call `createClient` anywhere else.
- `supabaseClient.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY ?? VITE_SUPABASE_ANON_KEY` and throws at import time if URL or key is missing — don't import it from code that must render without env vars.
- Types live in `src/types` and must match the migrations in the same PR.
