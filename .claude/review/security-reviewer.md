# security-reviewer verdict — delete-account

**Verdict: PASS** (one advisory warn, not a blocker).

## Passed
1. **No IDOR.** `userId` comes only from the JWT-verified `getUser()`
   (`userData.user.id`); the request body is never read, so a caller can delete
   only themselves — never an arbitrary id.
2. **No secret in client.** The service-role key is read from `Deno.env` in the
   function; nothing in `src/` references it. The client only invokes the
   function with its existing publishable key.
3. **Defense in depth.** `verify_jwt = true` at the gateway PLUS the in-function
   `getUser()` 401 — unauthenticated calls can't reach `deleteUser`.
4. **Blast radius = caller's own rows.** Every user/owner table cascades from
   `auth.users(id)`; deleting one auth row touches only that user's data.
5. **Idempotent.** A "not found" on retry is treated as success.

## Abuse cases
- CSRF/replay: bounded — the JWT (in-memory session, not a cookie) is the gate
  and can't be forged or replayed cross-origin; replay is bounded by JWT expiry.
- Self-spam: first call deletes the user; later calls fail at the gateway or the
  idempotent not-found path. Harmless.

## Warn (accepted, not blocking)
- `Access-Control-Allow-Origin: *` on a destructive endpoint. Safe here because
  the JWT can't be read cross-origin, and it matches the existing functions'
  CORS. Tightening CORS to the app origin across all functions is a reasonable
  future defense-in-depth follow-up, not part of this PR.
