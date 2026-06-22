# Security review — Biome + Depot migration (2026-06-22)

**Verdict: PASS**

Checked:
- No new tables; no RLS changes
- `supabaseClient.ts` uses two-prefix publishable-key fallback; no secret in client code
- `vite.config.ts` exposes only VITE_/NEXT_PUBLIC_ prefixes
- Edge Functions read secrets from `Deno.env` only; Authorization non-null assertions are JWT-gate-safe
- All biome-ignore suppressions are specific and justified; no security-related lint rules disabled
- `depot-ubuntu-latest` runner change is infrastructure only — no code impact
- No auth, money, PII, or upload code touched
