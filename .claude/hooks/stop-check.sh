#!/usr/bin/env bash
# Stop/SubagentStop hook: block task completion (exit 2, reason on stderr)
# unless the PR self-check is fully ticked AND memory was updated this task
# (or the PR states "no new lesson"). Runs only at task end, never on writes.
set -u
input=$(cat)

# Hook contract: when stop_hook_active is true we already blocked once this
# turn — let the stop through to avoid an infinite loop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only police task end on claude/* work branches; plain Q&A sessions on main
# have no PR to verify.
branch=$(git branch --show-current 2>/dev/null)
case "$branch" in claude/*) ;; *) exit 0 ;; esac

fail() { echo "$1" >&2; exit 2; }

body=""
if command -v gh >/dev/null 2>&1; then
  body=$(gh pr view "$branch" --json body -q .body 2>/dev/null)
fi
if [ -z "$body" ]; then
  fail "Blocked: no open PR found for branch '$branch' (or gh CLI unavailable). A task ends with ONE PR into main carrying the completed '## Self-check' checklist."
fi

printf '%s' "$body" | grep -q '^## Self-check' \
  || fail "Blocked: the PR description is missing the '## Self-check' heading. Add the checklist from CLAUDE.md, completed."
printf '%s' "$body" | grep -q -- '- \[ \]' \
  && fail "Blocked: the PR self-check still has unticked boxes. Do the work each unticked item names, then tick it ('- [x]')."

# Memory check: a memory file changed this task (committed on the branch or
# still in the working tree), or the PR explicitly states "no new lesson".
base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)
changed=$(
  git diff --name-only "$base" HEAD 2>/dev/null
  git status --porcelain 2>/dev/null | awk '{print $NF}'
)
# MEMORY.md anywhere, a folder CLAUDE.md (not the read-only root one), or an
# agent memory file.
if printf '%s\n' "$changed" | grep -Eq '(^|/)MEMORY\.md$|.+/CLAUDE\.md$|\.memory\.md$'; then
  exit 0
fi
printf '%s' "$body" | grep -qi 'no new lesson' && exit 0

fail "Blocked: no memory file (MEMORY.md, a folder CLAUDE.md, or an agent *.memory.md) was modified this task. Record the lesson in the right tier, or state 'no new lesson' in the PR description."
