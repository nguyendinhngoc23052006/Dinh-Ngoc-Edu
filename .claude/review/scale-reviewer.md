# scale-reviewer verdict — pet companion overhaul + mobile header fix

**Verdict: APPROVE — rAF loop bounded and cleaned up; no DB/query scale concerns.**

- **usePetWander rAF loop:** gated by both the `enabled` flag and
  `prefers-reduced-motion` (early return → no loop when no pet is shown or motion is
  reduced); the rAF is cancelled and the resize listener removed on unmount; `dt` is
  clamped to 50ms so a backgrounded-tab gap can't cause a jump. Browsers auto-throttle
  rAF on hidden tabs, so no `visibilitychange` handling is needed.
- **PetSprite preload:** one `Image()` per species change (bounded); a stale late error
  is harmless because failure is keyed to the species id.
- **DB:** migration UPDATEs 9 catalog rows only — no new query patterns, no filtered
  columns, no index gaps. Render-time `.find()`/`Map` lookups are in-memory over already
  fetched small lists (MAX_PETS=3); no N+1.

Non-blocking note: `setPos` runs each frame, re-rendering one small fixed element — fine
as designed; if profiling ever shows jank, drive the transform via a ref instead of state.
