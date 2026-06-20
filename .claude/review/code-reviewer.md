# Code Review — 2026-06-20 (schema: remove additionalProperties for Gemini OpenAPI subset)

## Verdict: PASS

### What was checked

- `supabase/functions/generate-course/pipeline.ts` lines 452-530: documenting comment, SYLLABUS_SCHEMA, QUESTIONS_SCHEMA (four additionalProperties entries removed).
- `supabase/functions/generate-course/pipeline.test.ts` lines 649-671: new `describe('response schemas')` block with `forbiddenKeysIn` helper and two schema tests.

### Findings

WARN — pipeline.test.ts:664-670 — `forbiddenKeysIn` has no negative-path test; a helper bug (e.g. failing to recurse) would let both assertions pass silently. Fix: add one positive-detection assertion such as `expect(forbiddenKeysIn({ additionalProperties: false, nested: { $ref: '#' } })).toEqual(['additionalProperties', '$ref'])`.

### What passed cleanly

- Recursive helper is logically correct: array/object/primitive cases are correctly ordered and terminate; `.concat(string[])` is correct.
- Comment accurately names the constraint (OpenAPI 3.0 subset), the rejected keyword, the 400 error message, and both post-call validators.
- SYLLABUS_SCHEMA fields align exactly with what validateSyllabus reads.
- QUESTIONS_SCHEMA and its calc sub-object align exactly with validateChapterQuestions/validateQuestion and the CalcSpec/CalcVariable interface in _shared/calc.ts.
- No additionalProperties, $schema, $ref, patternProperties, or definitions in either schema (grep-confirmed).
- No duplication, no missing test coverage for the changed constants, no Supabase access in components.
