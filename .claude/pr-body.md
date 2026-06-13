Phases 3–7 of the agreed roadmap, delivered together at your request ("the next steps in 1 go") as one PR built from a clean stack of per-phase commits. Each phase keeps its own focused, UTC-timestamped migration; this branch is the single one I'm allowed to push to, so the phases land as one reviewable PR rather than five.

## What's in it (commit by commit)
1. **Calculation questions** — a new `calc` question kind stores a formula + its variables (`questions.calc` jsonb). The lesson UI rolls fresh random values every take, fills the prompt, and computes the answer with a small **no-`eval`** shunting-yard evaluator (`_shared/calc.ts`). Generation emits calc questions only when the source states a formula.
2. **AI-driven difficulty** *(already merged as #22; not re-included here)* feeds into…
3. **Credits economy** — generation marks each lesson with a credit prize derived from its questions' difficulties (easy=1/med=2/hard=3). A new `profiles` table holds the balance + cosmetic prefs. Finishing a lesson calls the **`complete-lesson` Edge Function**, which **re-grades every answer server-side by value** (never trusting a client score) and, on a flawless run, awards the prize **once** via an atomic, `service_role`-only RPC.
4. **Theme + pet market** — one `cosmetics` catalog + `user_cosmetics` ownership table back both. Buying/equipping go through SECURITY DEFINER RPCs that deduct credits atomically and enforce ownership. Themes recolor the whole app via CSS variables; the pet walks along the bottom while studying and can be turned off in Settings.
5. **Homepage/UI overhaul** — a themed gradient hero with the upload form front-and-centre, gamification highlights, step cards, and per-lesson credit-prize badges on the course map.

## Security (abuse cases)
- **Credits can't be minted.** `profiles` revokes blanket UPDATE and grants only `update (pet_enabled)`; the balance moves only through trusted server code (the re-grading Edge Function via `award_lesson_credit`, restricted to `service_role`; and `purchase_cosmetic`, which deducts atomically with a row lock). All DEFINER functions `set search_path` and validate the caller.
- **Flawless can't be faked.** The Edge Function authenticates the caller's JWT, checks they can view the course, and re-grades by value (option *texts*, so client option-shuffling is irrelevant). Double-claim is blocked by the `node_progress.credited` CAS.
- **No code execution from formulas.** The calc evaluator parses arithmetic only; a malformed/tampered submission grades as wrong, never throws/crashes.

## Tech-debt / simplification pass (you asked)
- Unified themes+pets into one catalog/ownership model + shared RPCs (instead of two parallel sets) — the second real use justified the shared abstraction.
- Removed the now-dead `completeNode`/its test (superseded by `completeLesson`).
- Hardened `gradeCalc` to return false (not throw) on tampered values; capped the client `responses` array server-side.
- One shared source for calc/grading across browser + Edge Functions (no duplication).
- (The cross-AI review agents I tried to run hit the org's monthly spend limit and returned nothing, so this pass was done by hand; findings above were applied.)

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration per change, UTC-timestamped latest (4 sequential files: calc_questions, profiles_economy, cosmetics — each one focused change, applied in order); new tables (profiles, cosmetics, user_cosmetics) all have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised (153 tests; new: calc evaluator/generator/grader incl. malformed input, server exact-grade incl. shuffle-resistance + unanswered + wrong-kind, credit-prize math)
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code (Edge Functions use platform-injected SUPABASE_* secrets only)
- [x] irreversible actions guarded + idempotent + flagged (credit award is idempotent via the credited CAS; purchases are atomic with a row lock — these are the state-changing actions)
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English

## For you
**What changed:** courses can now have auto-graded calculation questions with random numbers; lessons award credits for a flawless run (verified server-side); a market lets you spend credits on app themes and a walking study pet; the homepage got a new hero-driven design.
**What you do next:** review the preview, then merge — no env or secret action needed (the Edge Functions use Supabase's auto-injected `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`). The migrations run on the PR's preview DB; to sanity-check, generate a course, finish a lesson with no mistakes (watch the credit badge rise), then buy/equip a theme and a pet in **Market**. Toggle the pet off in **Settings**.
**How to roll it back:** revert this PR on GitHub, then add a fix-forward migration dropping the new tables/columns (`profiles`, `cosmetics`, `user_cosmetics`, `questions.calc`, `nodes.credit_prize`, `node_progress.credited`) and restoring `clone_course`'s prior column list — a merged migration can't be un-run, so removal is a new migration, not a file revert. The `complete-lesson` Edge Function is only invoked from the lesson finish screen; reverting the client stops calling it.
