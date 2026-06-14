# Make credit spends idempotent (no double-charge on retry)

Phase 0 defect #2. `buy_food` and `feed_pet` *accumulate* (`qty += `, `xp += `),
so a spend whose response was lost — then retried by the user — charged twice.
`purchase_cosmetic` was already replay-safe via its "you already own this" check,
but is brought under the same mechanism for uniformity.

Each spend now takes a **client-generated idempotency key**. The first call with
a key records it (in a new `idempotency_keys` ledger) and charges; a replay with
the *same* key returns the post-charge state **without charging again**. The
client holds the key stable across retries of one action and rotates it on
success, so a retry-after-lost-response is a no-op while a fresh deliberate
action charges normally. The per-action button-disable already in place stops
the rapid double-click; the ledger stops the lost-ack double-charge.

## What's in the diff
- **Migration `20260614120000_idempotent_spends.sql`:** adds the
  `idempotency_keys` table (PK `(user_id, key)`, RLS: read-own only; writes go
  through the SECURITY DEFINER functions), and recreates `buy_food`,
  `purchase_cosmetic`, `feed_pet` to take `p_idempotency_key uuid` with the
  claim → replay-return → charge flow. Each spend self-prunes the caller's keys
  older than 1 day so the ledger stays bounded (a key that old can never be
  replayed — the client rotates its key on reload).
- **`useIdempotencyKeys` hook:** holds a stable key per action id in a ref;
  `keyFor(id)` reuses until `clearKey(id)` (called only on success).
- **Services:** `buyFood` / `purchaseCosmetic` / `feedPet` take a required
  `idempotencyKey` and forward it as `p_idempotency_key`.
- **MarketPage & PetsPage:** thread a stable key through buy / buy-food / feed,
  clearing it on success.
- **`src/types/database.ts`:** added the `IdempotencyKey` row type.
- **Service tests:** updated to pass and assert the new key arg.

## Migration in plain English
A new tiny table remembers, per user, which spend requests have already been
processed (by a random key the app generates). Buying food, buying a theme, and
feeding a pet now check that table first: if they've seen this exact request
before, they return the previous result instead of charging again. Each request
also tidies up the user's own entries older than a day. Money amounts are still
computed on the server from the catalog, never trusted from the browser.

## Abuse case (money)
A double-submit (double-click or a lost-response retry) could previously
double-charge credits or double-spend food. Blocked by: (1) the per-action
button stays disabled while a call is in flight; (2) the server records each
request key and replays the prior result rather than re-charging; (3) a failed
call's key claim is rolled back with the transaction, so a genuine retry still
works. Amounts are re-derived server-side under a `for update` balance lock;
keys are scoped to the server-derived `auth.uid()`, so no cross-user replay.

## Self-check
- [x] base = main; exactly one PR
- [x] ≤ 1 migration, UTC-timestamped latest; new tables have RLS; src/types matches
- [x] tests/lint/typecheck green; happy AND unhappy paths exercised
- [x] scripts still named exactly `lint` and `typecheck`
- [x] key read via the two-prefix fallback chain; envPrefix consistent; nothing hardcoded; no secret in code
- [x] irreversible actions guarded + idempotent + flagged
- [x] no avoidable debt; memory updated and pruned
- [x] migrations explained in plain English
- [x] reviewers ran — `.claude/review/*` verdicts refreshed this PR
- [x] every subagent dispatched on a model below the orchestrator's — never inherited

(The three reviewers ran on Sonnet, one tier below this Opus session, and all
returned PASS; their WARNs are fixed in the diff except one documented inline.)

## For you
**What changed:** buying food, buying a theme, and feeding a pet can no longer
double-charge your credits (or double-spend food) if you double-click or retry
after a dropped connection — the server now remembers each request and won't
process it twice.

**What you do next:** review the preview and merge. The migration runs first on
the preview DB; confirm it applies cleanly. To exercise it: buy a food item, and
confirm a rapid second click (or a refresh-and-retry) doesn't deduct twice. No
env/secret/dashboard action needed.

**How to roll it back:** revert this PR. To fully undo the schema on a database
that already applied it, add a follow-up migration that
`drop table idempotency_keys` and recreates the three functions without the
`p_idempotency_key` parameter (the prior definitions live in
`20260613052000_cosmetics.sql` and `20260613150000_food_and_feeding.sql`).
