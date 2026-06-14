# Public user display name

Phase 1 #2. Accounts had no human name — public courses on Explore showed no
author, so the page felt anonymous. This adds an optional display name a user
sets in Settings, shown as the author on public courses.

## What's in the diff
- **Migration `20260614153000_user_display_name.sql`:** adds
  `profiles.display_name` (text, `≤50` CHECK); `grant update (display_name)` so a
  user can write its own name (the column-level grant list is the real write
  lockdown — RLS still scopes the row); and a view `public_profiles` exposing
  ONLY `(user_id, display_name)`, and only for users who set a name AND own a
  public course, granted SELECT to anon/authenticated.
- **`profileService.ts`:** `validateDisplayName`, `setDisplayName` (trim +
  validate, writes own row), `getDisplayNames(userIds)` — one batched query
  against the view, dedupes ids, drops null names.
- **`SettingsPage.tsx`:** a display-name field + Save, with busy/disabled/error
  and a "Saved." note. Uses a derived `nameEdit ?? profile.display_name`
  (no effect-based sync).
- **`CourseCard` + `ExplorePage`:** Explore batch-fetches the page's authors in
  one query and shows "by {name}" per card.
- **`CoursePage.tsx`:** shows the author under the title when viewing someone
  else's course.
- **`database.ts`:** `display_name` on `Profile`. **`seed.sql`:** demo user gets
  `display_name = 'Demo Teacher'` so the seeded public course shows an author.
- **Tests:** `profileService.test.ts` covers the three new functions, happy and
  unhappy.

## Security / abuse
- **No private-data leak.** `profiles` RLS is unchanged (own-row-only); credits
  and preferences stay private. The public view projects only the name. An RLS
  policy can't be column-scoped, so the view is the correct minimal tool.
- **Bounded disclosure.** Only public-course authors with a set name appear in
  the view — exactly the author-label use case; user_ids of public-course owners
  are already public on the courses.
- **Validated input.** `setDisplayName` trims + length-checks; the column also
  carries a matching CHECK.

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

(No new table — a column on `profiles` + a read-only projection view, both with
plain-English comments in the migration. No irreversible action. Reviewers ran
on Sonnet, one tier below this Opus session — all three PASS. Memory updated at
`supabase/CLAUDE.md` with the projection-view + column-grant pattern.)

## For you
**What changed:** users can set a display name in Settings, and it shows as the
author "by {name}" on public courses in Explore and on the course page.

**What you do next:** review the preview — open **Settings**, set a display name,
save; then open **Explore** and confirm the seeded "Demo Teacher" course shows
its author. No env or dashboard changes needed. Then merge.

**How to roll it back:** revert this PR. The `display_name` column and
`public_profiles` view are additive and unused once the code is gone; you may
drop them later with a follow-up migration, but leaving them is harmless.
