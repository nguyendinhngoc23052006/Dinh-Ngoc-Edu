# Security Review — 2026-06-19

## Verdict: PASS

### Findings

**FIXED (this PR) — `owns_course` revoke was incomplete; now revokes from `public, anon` and re-grants to `authenticated`**
Originally only revoked from `anon`, leaving the default PUBLIC grant active. Updated to match the `clone_course` pattern: revoke from `public, anon`, then explicit grant to `authenticated` (needed for write RLS policies on chapters/nodes/questions).

**NOTE — `generation_error` column visible in network responses for public courses (pre-existing)**
The courses SELECT policy exposes all columns to public-course viewers. The UI gates display with `isOwner`, but the raw provider error string (capped at 500 chars) is in the API response. Pre-existing, not introduced by this PR — noted for a future fix (projection view or sanitized error string).

**NOTE — CREATE OR REPLACE grant drift pattern documented**
The root cause of `clone_course`'s anon exposure (CREATE OR REPLACE in later migrations without paired REVOKE/GRANT) is now documented in `supabase/CLAUDE.md` to prevent recurrence.

**PASS — No secrets in client code, no XSS vectors, no auth bypass, input validation correct, abuse cases documented.**

### What was checked
- `supabase/migrations/20260619050000_revoke_rpc_on_internal_functions.sql` — all REVOKE/GRANT statements
- `supabase/functions/generate-course/index.ts` — auth check, input validation, secrets, atomic claim
- `supabase/functions/generate-course/pipeline.ts` — AI output validators, length caps
- `src/services/generationService.ts` — client-side Edge Function invocation
- `src/pages/CoursePage.tsx` — auth bypass paths, owner gating, XSS
- `src/index.css` — no XSS vectors
- Grepped entire `src/` for `dangerouslySetInnerHTML`, `innerHTML`, service-role keys — all clear
