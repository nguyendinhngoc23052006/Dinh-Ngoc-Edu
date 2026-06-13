#!/usr/bin/env bash
# Stop/SubagentStop hook: block task completion (exit 2, reason on stderr)
# unless the committed .claude/pr-body.md carries the fully ticked Self-check,
# the three reviewer verdicts in .claude/review/ were refreshed this task, AND
# memory was updated this task (or pr-body.md states "no new lesson").
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

# Floor guard: the three read-only reviewers are mandatory — a CRUD request
# that deletes one must be caught before it can ship.
for r in security-reviewer code-reviewer scale-reviewer; do
  [ -f ".claude/agents/$r.md" ] \
    || fail "Blocked: reviewer agent .claude/agents/$r.md is missing — the three-reviewer floor can never be deleted away. Restore it before stopping."
done

body_file=".claude/pr-body.md"
[ -f "$body_file" ] || fail "Blocked: work exists on '$branch' but $body_file is missing. Write the PR description there FIRST (with the completed '## Self-check'), open the PR from it, then stop."

grep -q '^## Self-check' "$body_file" \
  || fail "Blocked: $body_file is missing the '## Self-check' heading. Add the checklist from CLAUDE.md, completed."
grep -q -- '- \[ \]' "$body_file" \
  && fail "Blocked: the Self-check in $body_file has unticked boxes. Do the work each unticked item names, then tick it ('- [x]')."

# Files touched this task (committed on the branch or still in the working tree).
# -uall expands untracked directories to individual files — a new file in a new
# directory (e.g. the first .claude/review/*) would otherwise hide as a dir entry.
changed=$(
  git diff --name-only "$base" HEAD 2>/dev/null
  git status --porcelain -uall 2>/dev/null | awk '{print $NF}'
)

# Reviewer verdicts: the orchestrator records each read-only reviewer's report
# to .claude/review/<agent>.md every PR — all three must exist AND be refreshed
# this task (so a stale verdict from a past PR can't pass for this one).
for r in security-reviewer code-reviewer scale-reviewer; do
  [ -f ".claude/review/$r.md" ] \
    || fail "Blocked: .claude/review/$r.md is missing — dispatch the $r on this diff and record its verdict there before opening the PR."
  printf '%s\n' "$changed" | grep -Eq "review/$r\.md$" \
    || fail "Blocked: .claude/review/$r.md was not refreshed this task — re-run the $r on this diff and record its current verdict."
done

# Memory: a memory file changed this task, or pr-body.md says "no new lesson".
# MEMORY.md anywhere, a folder CLAUDE.md (not the read-only root one), or an
# agent memory file.
if printf '%s\n' "$changed" | grep -Eq '(^|/)MEMORY\.md$|.+/CLAUDE\.md$|\.memory\.md$'; then
  exit 0
fi
grep -qi 'no new lesson' "$body_file" && exit 0

fail "Blocked: no memory file (MEMORY.md, a folder CLAUDE.md, or an agent *.memory.md) was modified this task. Record the lesson in the right tier, or state 'no new lesson' in $body_file."
