# src/ — local wiring

- Components render UI only; data access and server-side validation live in `src/services/` (create it with the first feature).
- All Supabase access goes through `src/lib/supabaseClient.ts` — never call `createClient` anywhere else.
- `supabaseClient.ts` reads the `VITE_` names with a `NEXT_PUBLIC_` fallback (the Supabase→Vercel integration injects previews' vars under its fixed `NEXT_PUBLIC_` names; `vite.config.ts` exposes both prefixes via `envPrefix`) and throws at import time if URL or key is missing — don't import it from code that must render without env vars.
- Types live in `src/types` and must match the migrations in the same PR.
