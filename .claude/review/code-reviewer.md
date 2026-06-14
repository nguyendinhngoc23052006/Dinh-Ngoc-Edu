# code-reviewer verdict — public user display name

**Verdict: PASS.** The one blocker was fixed; the warn is declined with rationale.

## Fixed
- `profileService.test.ts` `getMyProfile` fixture now includes `display_name:
  null`, matching the updated `Profile` interface.

## Declined (warn)
- `SettingsPage.saveName` passes the raw `name` to `setDisplayName` (so the
  service validates whitespace-only input) while the context patch uses
  `name.trim()`. These agree in effect — the service stores `trim(name)`, which
  equals the patched value — so the raw call is intentional, not a divergence.

## Passed
1. **No N+1.** ExplorePage batches the page's owner ids into one
   `getDisplayNames` call; CoursePage calls it once inside its unified load.
2. **No Supabase in components** — all access via `profileService`.
3. **UI states.** Settings: busy/disabled + error + "Saved."; Explore: a failed
   author fetch degrades gracefully (cards still render); CoursePage unchanged
   loading/error/not-found.
4. **No duplication / oversized files** — all changed files well under ~200 lines.
5. **Sibling tests** for `validateDisplayName`, `setDisplayName`,
   `getDisplayNames` on happy and unhappy paths.
6. **Derived-name pattern correct.** `name = nameEdit ?? profile.display_name ??
   ''` avoids effect-based sync; `save(apply, patch)` keeps the profile context
   in step; `nameEdit` resets to null on success so it re-tracks the profile.
