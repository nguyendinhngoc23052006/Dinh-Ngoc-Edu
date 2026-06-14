# code-reviewer verdict — delete-account

**Verdict: PASS.** Two warns fixed in-diff; one deferred with rationale.

## Fixed
- **CSS collision.** The new `button.danger` rule would have restyled
  pre-existing `.danger` buttons (ConfirmDialog, CourseSettings, PetsPage). Now
  scoped to `.danger-zone button.danger`, so only the delete button is affected.
- **File size.** Extracted the danger zone into a self-contained
  `components/settings/DeleteAccountCard.tsx` (owns its own state); SettingsPage
  is back to 168 lines.

## Deferred (not a blocker)
- `corsHeaders` + `json()` are now duplicated across all four Edge Functions.
  Extracting `supabase/functions/_shared/http.ts` is warranted, but that is a
  behaviour-preserving refactor touching three functions unrelated to this
  feature — our rules keep refactors out of feature PRs. Left as debt (noted in
  the PR), to be done stand-alone.

## Passed
- Components call the service layer (`authService`), not supabase directly.
- UI states: typed-"DELETE" gate, busy/disabled, error, success navigation.
- `authService.test.ts` covers `confirmsDeletion` and `deleteAccount` (happy +
  error, and that signOut is skipped on error).
- `delete-account` is declared in `config.toml`; idempotent not-found handling.
