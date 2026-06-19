# Scale Review — PR #52

**Verdict: PASS** (after fixes applied; two items noted for future)

## Findings resolved

1. **WARN → FIXED** `index.ts:314-320` — `credit_prize` UPDATE error was silently discarded. Now captures `{ error: prizeError }` and throws.

2. **WARN → FIXED** `index.ts:249` — Inter-call delay was 1500ms, below Gemini free-tier 15 RPM floor (4000ms minimum). Raised to 4000ms.

## Noted for future (not this PR's scope)

3. **NOTED** `index.ts:141` — `courses(status, generation_started_at)` has no composite index. The stale-processing OR filter is a full-table scan. Low frequency (once per invocation), acceptable at current scale.

4. **NOTED** `index.ts:313-321` — Per-node UPDATE for `credit_prize` is a structural N+1 (up to 40 sequential UPDATEs). Bounded by schema constants.

## Checked and clear

- All DB queries paginated/limited
- Question inserts batched per chapter
- Wipe-before-rebuild checked for errors — no duplicate-insert risk
- Quality gate issues at most 1 extra syllabus call
- `ensureTime(deadline)` guards every loop iteration
