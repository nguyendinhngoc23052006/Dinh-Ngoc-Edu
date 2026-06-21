# Security Review — 2026-06-21 (generate-course: per-lesson pipeline rework)

## Verdict: PASS

## Findings

No new security violations introduced by this diff.

WARN (pre-existing, not introduced here) — `supabase/migrations/20260610213500_core_schema.sql` and `supabase/functions/generate-course/index.ts` — `generation_error` on a `public` course is readable by all authenticated users via the existing SELECT policy; the new code embeds Gemini HTTP error body snippets (up to 300 chars) and AI-generated lesson titles in that field. No API key leaks (key is only in request headers, never in responses), but internal Gemini error messages and quota/model details could be exposed. Pre-existing — defer to a stand-alone PR that adds an owner-only projection view for `generation_error`.

## Verified as secure

1. Caller's JWT scopes all DB operations — no service-role key exists in this function.
2. `force` parameter is honored only after `course.owner_id !== userData.user.id` ownership verification — not a trust-boundary bypass.
3. All LLM output passes through `validateNodeQuestions` → `validateQuestion` before insert. Length caps intact (prompt ≤1000, options/accepted ≤300, MAX_QUESTIONS_PER_NODE=10 ceiling).
4. Prompt-injection sanitisation preserved: lesson titles (`safeTitle`) and echoed retry prompts are quote-substituted and newline-squashed at every interpolation site in `buildNodeQuestionsPrompt`. Tests cover both cases.
5. `AI_API_KEY` read only via `Deno.env.get`, placed only in the `x-goog-api-key` HTTP header, never logged or written into `generation_error`.
6. `claimable` status string is built from server-read `course.status`, never from request body.
7. No new migration in this diff — RLS check N/A.
