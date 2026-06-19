# Security Review — PR #52

**Verdict: PASS** (after fixes applied)

## Findings (all resolved)

1. **WARN → FIXED** `pipeline.ts:391` — AI chapter titles flowed unsanitized into quality-gate feedback appended to re-ask prompt. Fixed: titles now sanitized (quotes + newlines stripped) before interpolation.

2. **WARN → FIXED** `pipeline.ts:413,438` — `safeTitle` only escaped double-quotes, not newlines. Fixed: added `.replace(/[\r\n]+/g, ' ')` to both prompt builders.

3. **NOTED** `index.ts:97` — explicit `owner_id` check is load-bearing for public courses (prevents IDOR on regeneration). No change needed; documented for maintenance.

## Checked and clear

- No new tables, no RLS gaps
- `AI_API_KEY` stays server-side (`Deno.env`), no secrets in client code
- `courseId` validated as non-empty string, used only as equality filter
- `output_language` comes from DB row (validated at creation time), not request body
- Quality-gate re-ask is a single retry, not a loop
