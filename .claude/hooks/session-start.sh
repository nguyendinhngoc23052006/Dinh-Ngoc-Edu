#!/usr/bin/env bash
# SessionStart hook: make the sandbox runnable, then load repo memory and the
# current branch into context (stdout from this hook is added to the session).
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund >&2
fi

echo "## MEMORY.md (repo memory)"
cat MEMORY.md 2>/dev/null
echo
echo "Current git branch: $(git branch --show-current 2>/dev/null)"
