# security-reviewer verdict — idempotent credit spends

**Verdict: PASS.** One WARN raised and fixed.

- **New table has RLS.** `idempotency_keys` enables RLS with a select-own policy
  and no insert/update/delete policy — writes happen only inside the SECURITY
  DEFINER spend functions (which bypass RLS). Unauthenticated reads blocked.
- **No secret in client code.** The hook uses only `crypto.randomUUID()`;
  services call through the shared client (publishable key via the two-prefix
  fallback). No service-role key referenced.
- **Server re-derives amounts.** All three RPCs validate `auth.uid()`, the key,
  the catalog item, and re-derive `cost` from the catalog row under a
  `for update` balance lock. Client never supplies a price.
- **Replay can't skip payment or cross users.** PK is `(user_id, key)` with the
  server-derived `caller`; a key only exists after a committed first charge (a
  later `raise` rolls back the claim), and replay returns only the caller's own
  current state. FOUND after `insert … on conflict do nothing` correctly
  distinguishes first-call (true) from replay (false).

**WARN (fixed):** `feed_pet`'s replay `select` now includes `and user_id =
caller` (defense-in-depth; was logically safe but not self-evident).
