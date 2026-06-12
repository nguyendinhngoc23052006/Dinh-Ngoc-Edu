#!/usr/bin/env bash
# Stop/SubagentStop hook: block task completion (exit 2, reason on stderr)
# unless the committed .claude/pr-body.md carries the fully ticked Self-check
# AND memory was updated this task (or pr-body.md states "no new lesson").
# Verifies git + filesystem ONLY — never gh or the network: cloud sandboxes
# may lack both, and a hook that can't read its evidence false-blocks forever.
set -u
input=$(cat)

# Hook contract: when stop_hook_active is true we already blocked once this
# turn — let the stop through to avoid an infinite loop.
if printf '%s' "$input" | grep -Eq '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Only police task end on claude/* work branches.
branch=$(git branch --show-current 2>/dev/null)
case "$branch" in claude/*) ;; *) exit 0 ;; esac

fail() { echo "$1" >&2; exit 2; }

base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)

# Q&A passthrough: no commits ahead of main and a clean tree means no work
# product exists to police (a discussion/verification session).
ahead=$(git rev-list --count "$base"..HEAD 2>/dev/null || echo 0)
dirty=$(git status --porcelain 2>/dev/null)
if [ "$ahead" = "0" ] && [ -z "$dirty" ]; then
  exit 0
fi

body_file=".claude/pr-body.md"
[ -f "$body_file" ] || fail "Blocked: work exists on '$branch' but $body_file is missing. Write the PR description there FIRST (with the completed '## Self-check'), open the PR from it, then stop."

grep -q '^## Self-check' "$body_file" \
  || fail "Blocked: $body_file is missing the '## Self-check' heading. Add the checklist from CLAUDE.md, completed."
grep -q -- '- \[ \]' "$body_file" \
  && fail "Blocked: the Self-check in $body_file has unticked boxes. Do the work each unticked item names, then tick it ('- [x]')."

# Memory check: a memory file changed this task (committed on the branch or
# still in the working tree), or pr-body.md explicitly states "no new lesson".
changed=$(
  git diff --name-only "$base" HEAD 2>/dev/null
  git status --porcelain 2>/dev/null | awk '{print $NF}'
)
# MEMORY.md anywhere, a folder CLAUDE.md (not the read-only root one), or an
# agent memory file.
if printf '%s\n' "$changed" | grep -Eq '(^|/)MEMORY\.md$|.+/CLAUDE\.md$|\.memory\.md$'; then
  exit 0
fi
grep -qi 'no new lesson' "$body_file" && exit 0

fail "Blocked: no memory file (MEMORY.md, a folder CLAUDE.md, or an agent *.memory.md) was modified this task. Record the lesson in the right tier, or state 'no new lesson' in $body_file."
