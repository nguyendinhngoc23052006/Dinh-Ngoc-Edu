# security-reviewer verdict — 2026-06-22

PR: add `.github/workflows/dependabot-auto-merge.yml`

## PASS

- `pull_request_target` is the correct trigger: runs in base branch context, no code checkout of the PR branch, GITHUB_TOKEN is granted write access for Dependabot PRs without exposing untrusted code to secrets.
- Permissions scoped minimally: `contents: write` and `pull-requests: write` only.
- `dependabot/fetch-metadata@v2` is the official action from Dependabot's own org — not a third-party action.
- Condition `github.actor == 'dependabot[bot]'` at the job level prevents the workflow from acting on any non-Dependabot PR.
- `gh pr merge --auto` queues a merge only when CI passes; it does not force-merge.
- Patch-only filter (`version-update:semver-patch`) minimises surface area — minor/major bumps still require human review.
- No secrets committed. No new external services. No RLS changes. No auth/money/PII/upload code touched.
