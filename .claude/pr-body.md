# User profile: public display name + account deletion

Phase 1 #2 and #3, on one branch. Two account-level features:

## 1. Public display name
Accounts had no human name, so public courses on Explore looked anonymous. Users
now set a display name in Settings, shown as the author on public courses.
- **Migration `20260614153000_user_display_name.sql`:** `profiles.display_name`
  (text, `≤50` CHECK); `grant update (display_name)` so a user can set its own
  name; a view `public_profiles` exposing ONLY `(user_id, display_name)` for
  users who set a name AND own a public course, granted SELECT to
  anon/authenticated. (RLS can't be column-scoped, so the projection view is the
  minimal way to publish only the name while credits stay private.)
- `profileService`: `validateDisplayName`, `setDisplayName`, `getDisplayNames`
  (one batched query, no N+1). Settings has a name editor; Explore and CoursePage
  show "by {name}".

## 2. Delete my account (hard delete, cascade)
There was no way to delete an account. Users can now permanently delete
themselves from Settings.
- **Edge Function `delete-account`** (declared in `config.toml`,
  `verify_jwt = true`): derives the user id from the caller's JWT (never the
  request body — the IDOR guard) and calls `admin.auth.admin.deleteUser` with the
  service role. It deletes no rows itself; every user/owner table cascades from
  `auth.users`, so all the user's data goes in one transaction. Idempotent
  (not-found on retry = success).
- `authService.deleteAccount()` invokes the function then signs out;
  `confirmsDeletion()` gates the UI. `DeleteAccountCard` requires typing "DELETE".

## Security / abuse
- **Display name:** no private-data leak — base `profiles` RLS unchanged
  (own-row-only); the view projects only the name, only for public-course
  authors. Input trimmed + length-checked + CHECK.
- **Delete account:** a user can only delete themselves (id from the verified
  JWT). Service-role key stays in `Deno.env`, never in client code.
  `verify_jwt` + in-function `getUser()` is defense in depth. The destructive
  action is gated (typed "DELETE"), idempotent, and bounded to the caller.

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

(One migration (display name); account deletion adds an Edge Function, no
migration. Irreversible action — account deletion — is guarded by a typed
confirmation, idempotent, and safe to verify in a preview (it only deletes the
caller's own test account); flagged for manual verify below. Reviewers ran on
Sonnet, one tier below this Opus session — all three PASS. Memory updated at
`supabase/CLAUDE.md`.)

**Debt I'm leaving:** all four Edge Functions duplicate `corsHeaders` + `json()`;
extracting `supabase/functions/_shared/http.ts` is owed as a stand-alone refactor
(kept out of this feature PR per the no-refactor-in-feature-PR rule).

## For you
**What changed:** (1) users set a display name in Settings, shown as "by {name}"
on public courses; (2) users can permanently delete their account from Settings
(type "DELETE" to confirm).

**What you do next:** review the preview. For display name: Settings → set a
name → Explore shows the seeded "Demo Teacher" course's author. For deletion:
make a throwaway account, Settings → type "DELETE" → confirm it's gone and you're
signed out. No env/dashboard changes needed (the `delete-account` function
deploys automatically because it's declared in `config.toml`, and uses the
platform-injected service-role key). Then merge.

**How to roll it back:** revert this PR. The `display_name` column and
`public_profiles` view are additive (drop later if you like); the
`delete-account` function stops being invoked once the client code is gone (you
can also delete it from the dashboard, but leaving it is harmless).
