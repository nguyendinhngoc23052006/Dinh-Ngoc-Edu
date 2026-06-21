# Security review — project rename to Dinh Ngoc Edu

**Verdict: PASS — no findings**

Reviewed: supabase/config.toml, package.json, package-lock.json, index.html, src/components/layout/AppLayout.tsx, src/pages/LandingPage.tsx, README.md, MEMORY.md, docs/ARCHITECTURE.md

- Project ID renamed in config.toml: `last-minute-self-learning` → `dinh-ngoc-edu` (local label only, not the remote Project ID).
- All changes are pure display strings, package metadata, and doc headings — no code logic, no queries, no mutations.
- supabaseClient.ts unchanged; reads publishable key via two-prefix fallback chain only.
- No migrations created or touched; no RLS changes; no auth/storage/secret logic.
- No new dependencies; no secrets introduced; no irreversible actions.
