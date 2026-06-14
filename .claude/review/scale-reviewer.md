# scale-reviewer verdict — idempotent credit spends

**Verdict: PASS.** Two WARNs raised; one fixed, one documented.

- **PK sufficient for lookups.** `(user_id, key)` covers the `on conflict
  (user_id, key)` claim directly; the RLS select and the self-prune both filter
  on `user_id`, the leading PK column. No extra index needed.
- **Row locks preserved.** The accumulating mutations keep their `for update`
  locks; the unique constraint serialises concurrent first-calls (one inserts →
  charges, the other sees the conflict → returns early).
- **No client reads of the ledger / no N+1.** Each RPC does point lookups only.

**WARN (fixed):** the ledger grew unbounded. Each spend now self-prunes the
caller's keys older than 1 day (keys older than that can never be replayed,
since the client rotates its in-memory key on reload). Bounded per user, no cron
or extension dependency.

**WARN (documented):** `purchase_cosmetic` runs its ownership check just before
taking the balance lock; safe because only the call that won the idempotency
claim reaches that point. Noted inline in the migration and the PR.
