# Security Review — PR #67 generation pipeline rework

## Verdict: PASS

### Findings
1. **Auth/RLS:** Caller JWT passed through to supabase client; `getUser()` enforced at entry; owner check (`course.owner_id !== userData.user.id`) blocks non-owner access. All `fillMissingQuestions` queries scope by `course.id`.

2. **No owner escalation:** `fillMissingQuestions` uses the same supabase client as `generate` (caller JWT, not service role). RLS owner policies on `nodes` and `questions` apply to every read and write.

3. **Atomic claim gate:** `needsFill=true` path goes through the same atomic claim (`status IN ('ready','failed','pending')` → `processing`) — no concurrent pipelines, no double-billing.

4. **Secret management:** `AI_API_KEY` read from `Deno.env` only; never in client code or response bodies.

5. **Prompt injection:** Node title sanitization (`replace(/"/g, "'")`) in place; titles originate from DB (owner-controlled, not open input).

6. **Input validation:** `courseId` validated as non-empty string; `force` as boolean; all AI responses through `validateNodeQuestions`/`validateSyllabus` before DB write.

7. **No new security boundary introduced.**
