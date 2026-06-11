# Repo memory

- Toolchain (scaffolded 2026-06): Node 22 LTS, Vite 8, React 19, TypeScript 6, ESLint 10 (flat config), Vitest 4, Supabase CLI 2.105.
- `npx supabase init` (CLI 2.105) already generates `[db.seed]` with `enabled = true` and `sql_paths = ["./seed.sql"]` — no config.toml edit needed.
- eslint-plugin-react-hooks v7: the flat config lives at `configs.flat.recommended`; `configs['recommended-latest']` is the legacy (eslintrc) shape and breaks ESLint 10.
- Prettier skips all `*.md` (see .prettierignore) so it never reformats the read-only CLAUDE.md constitution files.
- Review agents (`.claude/agents/*.md`) are read-only (Read/Grep/Glob); each has a `<name>.memory.md` sidecar that the orchestrator updates from the agent's "Memory candidates" report section.
- Stop/SubagentStop hook (`.claude/hooks/stop-check.sh`) gates task end: it needs `gh` to read the PR body, only polices `claude/*` branches, and always allows the stop when `stop_hook_active` is true (loop guard). Escape hatch when nothing was learned: write "no new lesson" in the PR description.
- Remote cloud sessions (Claude Code on the web) have no `gh` CLI, so stop-check.sh always false-blocks the first stop even when a compliant PR exists; the loop guard then lets the second stop through. Verify the PR via the GitHub MCP tools instead.
- eslint-plugin-react-hooks v7 also ships strict `set-state-in-effect` and `use-memo` rules: a generic fetch hook (src/hooks/useAsync.ts) needs targeted disables — moving the setState into a dynamically-depped useCallback just trips the next rule.
