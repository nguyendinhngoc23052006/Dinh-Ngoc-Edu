# code-reviewer verdict — idempotent credit spends

**Verdict: PASS.** No code-quality findings introduced.

- **Hook abstraction justified.** `useIdempotencyKeys` has exactly two callers
  (MarketPage `buy`/`buyOne`, PetsPage `feed`) — the second-real-use threshold.
- **No components doing data access.** All Supabase calls stay in `src/services/`.
- **UI states intact.** Market and Pets keep loading / error / per-action /
  empty states; the per-action `busyId` already disables buttons in flight.
- **Service changes have sibling test changes.** All three service tests now
  pass a key and assert `p_idempotency_key` in the RPC args.
- **Retry-dedup semantics correct.** `clearKey` runs only after a successful
  `await`; a throw skips it, so the key survives for retry and a replay is a
  no-op server-side. On success the key rotates so the next action charges.

Pre-existing (not this diff): MarketPage/PetsPage were already >200 lines; this
PR adds ~6 lines each (import + hook call), not the cause.
