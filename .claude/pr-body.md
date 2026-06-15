# Phase 2 — complete the learning loop

Five independent improvements to course/test management and the public catalogue.
**No migration** — every RLS policy, column, and the regenerate path already
existed.

## What's in the diff
**#6 Mock test delete & rename.** `mockTestService.renameMockTest` (trim +
120-char cap) and `deleteMockTest`; `MockTestList` gains inline rename + delete
for the owner (RLS scopes both). CoursePage wires the owner handlers.

**#7 Manage materials after creation (add + remove + re-generate).** New
`MaterialsManager` (owner-only): add a file (same upload + text-extraction path
as creation) or remove one (`materialService.deleteMaterial` — storage bytes
then the row). CoursePage now loads materials for the owner at any time and
offers a **Regenerate course** button (existing `startGeneration`), with a clear
warning that regenerating rebuilds chapters/questions/progress. The owner block
is grouped into a new `OwnerCourseControls` component to keep CoursePage focused.

**#8 Explore search / filter / sort.** `listPublicCourses(page, { search,
language, sort })` — title `ILIKE` (LIKE metacharacters escaped), language
filter, newest-first or title A–Z; still public-only and paginated. ExplorePage
gets a filter bar (search applied on submit, not per keystroke).

**#9 NewCoursePage error surfacing.** The old silent `catch {}` is gone: an
upload/generation failure is carried to the course page (where the materials,
Start-generation, and Delete recovery paths live) via router state and shown
there — without the duplicate-shell risk of resubmitting the form.

**#10 Explore "Save" persistence.** `listSavedCourseIds` hydrates the
Save/Saved state once on load, so it reflects prior sessions; the button is now a
save/unsave toggle with optimistic state and a per-card in-flight guard against
double-clicks.

## Security / scale notes
- Mock-test rename/delete and `deleteMaterial` carry no code-level owner check by
  design — the existing owner-only RLS (and the owner-scoped storage path) are
  the trust boundary. A crafted `storage_path` can't touch another user's file
  (storage policy keys on the uid path segment).
- The title `ILIKE '%term%'` is a sequential scan with no trigram index —
  acceptable while the public catalogue is small and paginated; flagged as
  future work (a `pg_trgm` index) in MEMORY.md.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(Zero migrations — all policies/columns existed. Irreversible actions: removing
a material deletes the file (owner-scoped, and the course is unaffected until you
regenerate); regenerating rebuilds the course and is gated behind an explicit
button + warning. Reviewers ran on Sonnet, one tier below this Opus session — all
three PASS after I fixed two code-review blockers (untested `unsaveCourse`;
unguarded concurrent save clicks). Memory updated at `MEMORY.md`.)

**Debt I'm leaving:** the four Edge Functions still duplicate `corsHeaders` +
`json()` (a `supabase/functions/_shared/http.ts` extraction, owed as a stand-alone
refactor — unchanged by this PR).

## For you
**What changed:** you can now rename/delete mock tests, add/remove a course's
source files and regenerate it, search/filter/sort the Explore catalogue, see why
a new course failed to start, and the Explore Save button remembers what you
saved.

**What you do next:** review the preview — on your own course, rename a mock
test, remove/add a material and hit Regenerate; on Explore, search + filter and
toggle Save (reload to confirm it sticks). No env or dashboard changes needed.
Then merge.

**How to roll it back:** revert this PR. It's code-only (no schema change), so
there's nothing to undo in the database.
