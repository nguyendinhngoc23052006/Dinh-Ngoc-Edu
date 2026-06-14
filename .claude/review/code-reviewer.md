# code-reviewer verdict — password-reset flow

**Verdict: PASS.** The one WARN was fixed in-diff.

- **Duplication.** `passwordProblem()` has two callers (justified). The email
  regex was duplicated between `validateCredentials` and `requestPasswordReset`
  (the WARN) — now extracted into an `emailProblem()` helper used by both, so
  the regex and message live in one place.
- **No components doing data access.** `LoginForm` and `ResetPasswordPage`
  import only from the service layer; no `supabase` call in components.
- **UI states.** Both forms handle busy/disabled and error; `ResetPasswordPage`
  also handles password-mismatch and the expired-link error. Early `return`s
  inside the `try` still hit `finally`, so `busy` always resets.
- **File sizes / responsibility.** LoginForm ~127, ResetPasswordPage ~72,
  authService ~125 lines — all under ~200, each single-responsibility.
- **Sibling tests.** New `authService.test.ts` covers `validateCredentials`,
  `requestPasswordReset`, and `updatePassword` on happy and unhappy paths.
