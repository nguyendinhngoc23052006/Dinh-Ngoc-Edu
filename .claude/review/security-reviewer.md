# security-reviewer verdict — password-reset flow

**Verdict: PASS.** No blockers; one ops step the human must do (redirect allow-list).

- **No email enumeration.** The notice always says "if an account exists…",
  with no branch on whether the address is registered; errors are thrown only
  for API failures, never "user not found".
- **Spam bound.** Repeated reset requests are capped by Supabase's project-wide
  mailer rate limit (mapped to a clear message), not a per-address one — the
  code comment was corrected to say so rather than implying full protection.
- **/reset identity integrity.** `updateUser({ password })` acts only on the
  Supabase recovery session the email link establishes; no client-supplied
  identity is trusted. The route is correctly public (the link arrives
  logged-out) — no auth bypass.
- **No secrets / no new table / no migration.** Pure client auth flow using the
  publishable client; no service-role key, no DDL, no RLS surface.
- **Single-use token.** Supabase's reset token is single-use; an expired/used
  link leaves no recovery session and `updateUser` errors, surfaced by the page.

**Ops step for the PR (not a code defect):** `redirectTo` is
`${window.location.origin}/reset`. The Supabase Auth **Redirect URLs** allow-list
must include the production `/reset` and a Vercel preview wildcard
(`https://*.vercel.app/reset`), or the link falls back to the Site URL. Called
out in the PR's "what you do next".
