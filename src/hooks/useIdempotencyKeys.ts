import { useRef } from 'react'

// Stable idempotency keys for credit-spending actions, held per action id until
// that action succeeds. Reusing the key on a retry lets the server dedupe a
// charge whose response was lost — so a manual retry can't double-charge —
// while clearing it on success means the next deliberate action gets a fresh
// key and charges normally. The id is the caller's own label for the action
// (e.g. `food:berry`), not the key itself.
export function useIdempotencyKeys() {
  const keys = useRef(new Map<string, string>())

  function keyFor(id: string): string {
    const existing = keys.current.get(id)
    if (existing) return existing
    const fresh = crypto.randomUUID()
    keys.current.set(id, fresh)
    return fresh
  }

  function clearKey(id: string): void {
    keys.current.delete(id)
  }

  return { keyFor, clearKey }
}
