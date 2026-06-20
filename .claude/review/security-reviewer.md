# Security Review — 2026-06-20 (generate-course: native Gemini API switch)

## Verdict: PASS (with 2 warnings, neither a blocker)

### What was checked

- `supabase/functions/generate-course/index.ts` — full file read; new `ChatOptions` interface, `x-goog-api-key` header, `/v1beta/models/{model}:generateContent` URL, `candidates/parts` response parsing, `thought` filter.
- `supabase/functions/generate-course/pipeline.ts` — full validation layer: `validateSyllabus`, `validateChapterQuestions`, `validateQuestion`, all length caps.
- `.env.example` — confirmed AI secrets not in Vite namespace.
- Grepped all of `src/` for `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `x-goog-api-key`, `gemini` — zero matches.
- No new migration in this diff; no RLS check needed.

### Findings

WARN — `index.ts:475` — Operator-controlled SSRF: `AI_BASE_URL` and `AI_MODEL` are read from Deno.env and interpolated directly into the fetch URL without sanitisation. If dashboard secrets are compromised, `x-goog-api-key` is forwarded to an attacker-chosen host. Low exploitability (requires dashboard access).

WARN — `.env.example:11` — Stale comment still reads "key for an OpenAI-compatible chat completions API" after switch to native Gemini API. No security impact; maintenance risk only.

### Verified as secure

1. Secret exposure: `AI_API_KEY` read only via `Deno.env` in the Edge Function; zero matches in `src/`; never hardcoded; key is not forwarded to the client.
2. User input validation: only `courseId` (string, non-empty) and `force` (strict `=== true`) enter from the request body; both are validated before use.
3. AI output validation: every persisted field is length-capped in `validateQuestion` (prompt 1000, options 300) and `validateSyllabus` (title 200, summary 500).
4. `thought` parts: correctly filtered by `!p.thought` before returning text; thinking tokens are never persisted or returned.
5. No new migration; RLS check not applicable.
6. Auth/money/PII: no new surface; existing atomic claim guard, owner check, and 30s timeout unchanged.
