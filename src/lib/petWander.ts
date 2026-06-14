// Pure wander math — no DOM, no React, no time source of its own — so the hook
// (src/hooks/usePetWander.ts) is a thin shell and this is unit-testable. The pet
// roams to random points across an area, pausing between trips, and faces the
// way it is walking. This replaces the old fixed left↔right footer crawl.

export type Facing = 'left' | 'right'

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export interface WanderState {
  x: number
  y: number
  // Current destination it is walking toward.
  tx: number
  ty: number
  facing: Facing
  // Remaining pause (ms) once it has arrived, before picking a new target.
  pauseMs: number
}

export const PET_SPEED = 70 // px per second
const PAUSE_MIN_MS = 800
const PAUSE_MAX_MS = 2600
const ARRIVE_EPS = 1.5 // px: close enough to count as arrived

function clamp(v: number, lo: number, hi: number): number {
  if (hi < lo) return lo
  return Math.min(Math.max(v, lo), hi)
}

// A random point inside the bounds. rng defaults to Math.random but is injected
// so tests are deterministic.
export function pickTarget(bounds: Bounds, rng: () => number = Math.random) {
  return {
    tx: bounds.minX + rng() * Math.max(0, bounds.maxX - bounds.minX),
    ty: bounds.minY + rng() * Math.max(0, bounds.maxY - bounds.minY),
  }
}

export function initialWander(
  bounds: Bounds,
  rng: () => number = Math.random,
): WanderState {
  const start = pickTarget(bounds, rng)
  const next = pickTarget(bounds, rng)
  return {
    x: start.tx,
    y: start.ty,
    tx: next.tx,
    ty: next.ty,
    facing: 'right',
    pauseMs: 0,
  }
}

// Advance the walk by dt milliseconds. Keeps the pet inside (possibly resized)
// bounds, moves it toward its target at PET_SPEED, and on arrival pauses, then
// picks a fresh target. Facing only flips on meaningful horizontal travel so it
// doesn't jitter when moving near-vertically.
export function stepWander(
  state: WanderState,
  dtMs: number,
  bounds: Bounds,
  rng: () => number = Math.random,
): WanderState {
  const x = clamp(state.x, bounds.minX, bounds.maxX)
  const y = clamp(state.y, bounds.minY, bounds.maxY)

  if (state.pauseMs > 0) {
    const remaining = state.pauseMs - dtMs
    if (remaining > 0) return { ...state, x, y, pauseMs: remaining }
    const next = pickTarget(bounds, rng)
    return { ...state, x, y, tx: next.tx, ty: next.ty, pauseMs: 0 }
  }

  const dx = state.tx - x
  const dy = state.ty - y
  const dist = Math.hypot(dx, dy)
  const step = (PET_SPEED * dtMs) / 1000

  if (dist <= ARRIVE_EPS || dist <= step) {
    // Arrived: snap to target and start a pause.
    const pause = PAUSE_MIN_MS + rng() * (PAUSE_MAX_MS - PAUSE_MIN_MS)
    return {
      ...state,
      x: clamp(state.tx, bounds.minX, bounds.maxX),
      y: clamp(state.ty, bounds.minY, bounds.maxY),
      pauseMs: pause,
    }
  }

  const nx = x + (dx / dist) * step
  const ny = y + (dy / dist) * step
  const facing: Facing =
    Math.abs(dx) < 0.5 ? state.facing : dx < 0 ? 'left' : 'right'
  return { ...state, x: nx, y: ny, facing }
}
