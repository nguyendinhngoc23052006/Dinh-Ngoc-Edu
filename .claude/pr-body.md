# Generation hardening + security-definer lockdown

Fixes three production generation bugs, improves pipeline reliability, and revokes unnecessary RPC exposure on internal SECURITY DEFINER functions flagged by the Supabase linter.

## What changed

**Bug 1 — Regenerate after new file upload (`generationService.ts`, `CoursePage.tsx`, `index.ts`)**
The server-side guard at `index.ts:99–109` returned `{status:'ready'}` immediately for any fully-generated course, silently no-oping any regeneration attempt. Added a `force` boolean to the request body: when `true`, the guard is skipped and the existing wipe+rebuild path runs normally. Wired through `startGeneration(courseId, force?)` and added a "Regenerate course" button on the course page for 'ready' owners.

**Bug 2 — Empty lessons after generation (`index.ts`, `pipeline.ts`)**
Added a third retry level: after the existing chapter-level call and chapter re-ask both fail for a node, a single-node call via `buildNodeQuestionsPrompt` (one chunk, one lesson, no calc example) is tried for each remaining empty node. Much smaller prompt, virtually impossible to truncate. If any node is still empty after all three retries the course is marked `'failed'` with a descriptive message — eliminating the confusing "ready with empty lessons" state.

**Bug 3 — Vietnamese PDF stalls indefinitely (`index.ts`, `pipeline.ts`)**
Two fixes: (1) every `fetch()` in `chat()` now carries a 30-second `AbortController` timeout — a hanging AI endpoint throws cleanly to the outer catch, which writes `status: 'failed'`, so courses can never stay stuck in `'processing'` forever; (2) `matchesOutputLanguage()` now decodes `\uXXXX` JSON escape sequences before testing for Vietnamese characters, eliminating the false-negative that caused a language retry to fire on every AI call for Vietnamese courses.

**Token / quality improvements (`pipeline.ts`, `index.ts`)**
- Syllabus excerpt reduced from 1800 → 600 chars per chunk: saves ~10 000 input tokens on the syllabus call; topic-identification needs a hint, not full content.
- `max_tokens` raised from 8192 → 16 384: comfortable headroom for verbose questions and non-Latin scripts.

**Security: revoke RPC exposure on internal functions (migration `20260619050000`)**
The Supabase linter flagged 1 ERROR + 19 WARNINGs on SECURITY DEFINER functions/views. After investigating each against the application flow:
- **Fixed (4):** `handle_new_user()` (trigger-only, was callable as RPC), `clone_course()` (CREATE OR REPLACE in later migrations re-inherited the default PUBLIC grant — anon could deep-copy courses without auth), `owns_course()` (revoked from anon — only used in write RLS policies), `rls_auto_enable()` (utility function, not an RPC).
- **Skipped (15):** `public_profiles` view (intentional SECURITY DEFINER to project two safe columns past own-row-only RLS), `can_view_course` (anon needs EXECUTE for SELECT RLS policies on public courses), all pet/food/cosmetic RPCs (intentionally SECURITY DEFINER, already auth-only with uid checks).
- **Dashboard action (1):** Leaked password protection — Pro Plan feature, to be enabled when the app goes live.

**Plain-English migration explanation:**
The migration revokes the ability to call four internal database functions as HTTP endpoints. `handle_new_user` is a signup trigger that should only fire automatically; `clone_course` was accidentally re-exposed to anonymous users when the function was updated; `owns_course` was unnecessarily callable by anonymous users; `rls_auto_enable` is a utility function.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck/e2e green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint`, `typecheck`, `test`, and `e2e`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged — `force=true` still goes through atomic claim; no double-billing. **Abuse case:** owner regenerating a public course wipes all chapters/nodes/questions via CASCADE and resets any students' progress rows — this is the owner's prerogative; students who need a stable version should clone.
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

## For you
**What changed:** Generation is now significantly more reliable (Vietnamese stalls fixed, empty lessons retry properly, owners can regenerate), and four internal database functions are no longer exposed as callable HTTP endpoints to unauthorized roles.
**What you do next:** Review the preview, then merge. No env/secret changes needed. When you upgrade to Pro Plan, enable leaked password protection in Dashboard > Authentication > Providers > Email.
**How to roll it back:** Revert this PR; the migration is purely additive (revokes only — no schema changes). All other changes are application code with no data side-effects.
