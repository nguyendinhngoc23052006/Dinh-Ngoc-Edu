# security-reviewer verdict — public user display name

**Verdict: PASS.** No findings.

- **Minimal public disclosure.** `public_profiles` projects only
  `(user_id, display_name)` and only for users who set a name AND own ≥1 public
  course. Users with no public course or no name are not listed. user_ids of
  public-course owners are already public (on the courses). Intended author label.
- **Private columns stay private.** The base `profiles` RLS is unchanged
  (own-row-only); credits/preferences are never reachable through the view,
  which selects just the two safe columns.
- **Column-scoped write.** `grant update (display_name)` lets a caller write
  only their own name (RLS still scopes the row); no other column becomes
  writable. Consistent with the existing pet-pref column grants.
- **Input validated.** `setDisplayName` trims + length-checks (≤50), and the
  column carries a matching CHECK — defense at both layers.
- **View is the correct tool.** A SELECT policy can't restrict columns, so a
  policy permitting public reads of `profiles` would leak credits. A definer-
  style projection view is the minimal, correct way to expose only the name.
