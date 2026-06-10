# Repo memory

- Toolchain (scaffolded 2026-06): Node 22 LTS, Vite 8, React 19, TypeScript 6, ESLint 10 (flat config), Vitest 4, Supabase CLI 2.105.
- `npx supabase init` (CLI 2.105) already generates `[db.seed]` with `enabled = true` and `sql_paths = ["./seed.sql"]` — no config.toml edit needed.
- eslint-plugin-react-hooks v7: the flat config lives at `configs.flat.recommended`; `configs['recommended-latest']` is the legacy (eslintrc) shape and breaks ESLint 10.
- Prettier skips all `*.md` (see .prettierignore) so it never reformats the read-only CLAUDE.md constitution files.
- Review agents (`.claude/agents/*.md`) are read-only (Read/Grep/Glob); each has a `<name>.memory.md` sidecar that the orchestrator updates from the agent's "Memory candidates" report section.
