# Password reset / forgot-password flow

Phase 1 #1. There was no way to recover an account — the login form had no
"forgot password" path, and a reset link would have 404'd. This adds the full
flow: request a reset email from the login screen, then set a new password on a
dedicated page the email link lands on.

## What's in the diff
- **`authService.ts`:** `requestPasswordReset(email)` →
  `supabase.auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset })`,
  and `updatePassword(pw)` → `supabase.auth.updateUser({ password })`. Extracted
  `emailProblem()` / `passwordProblem()` helpers (each now has two callers) so
  the validation strings live in one place.
- **`LoginForm.tsx`:** a "Forgot your password?" link opens a third `forgot`
  mode (email only) that sends the reset link and shows a neutral confirmation.
- **`ResetPasswordPage.tsx` + `/reset` route (public):** where the email link
  lands. Supabase establishes a recovery session from the link, so the user sets
  a new password (with confirm) and continues to the app; an expired/used link
  surfaces a clear "request a new one" error.
- **`authService.test.ts` (new):** covers `validateCredentials`,
  `requestPasswordReset` (redirect URL, malformed email, rate-limit mapping), and
  `updatePassword` (min length, success, API error) — happy and unhappy paths.

## Security / abuse
- **No email enumeration:** the confirmation always says "if an account
  exists…", never branching on whether the address is registered.
- **Spam:** bounded by Supabase's project-wide mailer rate limit (mapped to a
  readable message), not a per-address one — stated in the code comment.
- **Identity:** `updateUser` acts only on the recovery session the email link
  creates; no client-supplied identity is trusted. Token is single-use.

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

(No migration / no new table / no `src/types` change — client-only auth flow.
Irreversible action = the reset email: it goes only to the address the user
typed, is rate-limited by Supabase, and is flagged below as needing a manual
allow-list step. Reviewers ran on Sonnet, one tier below this Opus session — all
three PASS; memory at `MEMORY.md` updated to list the `/reset` redirect path.)

## For you
**What changed:** users can now reset a forgotten password — a "Forgot your
password?" link on the login screen emails a reset link, which opens a page to
choose a new password.

**What you do next (one manual step, required for the link to work):** in the
**Supabase dashboard → Authentication → URL Configuration → Redirect URLs**, add
`https://<your-production-domain>/reset` and `https://*.vercel.app/reset`.
Without these, the reset link falls back to the project's Site URL instead of
landing on `/reset`. Then review the preview: click "Forgot your password?",
send yourself a link (the demo mailer is rate-limited project-wide), and confirm
`/reset` lets you set a new password. Then merge.

**How to roll it back:** revert this PR — it's client-only, nothing to undo in
the database. (You may also remove the `/reset` allow-list entries, but leaving
them is harmless.)
