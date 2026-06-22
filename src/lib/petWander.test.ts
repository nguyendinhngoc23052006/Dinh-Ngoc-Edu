import { describe, expect, test } from 'vitest'
import {
  type Bounds,
  PET_SPEED,
  type WanderState,
  initialWander,
  pickTarget,
  stepWander,
} from './petWander'

const BOUNDS: Bounds = { minX: 0, maxX: 100, minY: 0, maxY: 100 }

// Deterministic rng: always returns 0.5 (picks the centre of any range).
const half = () => 0.5

describe('pickTarget', () => {
  test('stays within bounds', () => {
    const t = pickTarget(BOUNDS, half)
    expect(t.tx).toBeGreaterThanOrEqual(BOUNDS.minX)
    expect(t.tx).toBeLessThanOrEqual(BOUNDS.maxX)
    expect(t.ty).toBeGreaterThanOrEqual(BOUNDS.minY)
    expect(t.ty).toBeLessThanOrEqual(BOUNDS.maxY)
  })

  test('uses the injected rng', () => {
    expect(pickTarget(BOUNDS, half)).toEqual({ tx: 50, ty: 50 })
  })
})

describe('stepWander', () => {
  test('moves toward the target at PET_SPEED', () => {
    const state: WanderState = {
      x: 0,
      y: 0,
      tx: 100,
      ty: 0,
      facing: 'right',
      pauseMs: 0,
    }
    const next = stepWander(state, 1000, BOUNDS, half)
    // One second at PET_SPEED px/s, moving purely along +x.
    expect(next.x).toBeCloseTo(PET_SPEED, 5)
    expect(next.y).toBeCloseTo(0, 5)
    expect(next.facing).toBe('right')
  })

  test('faces left when the target is to the left', () => {
    const state: WanderState = {
      x: 100,
      y: 0,
      tx: 0,
      ty: 0,
      facing: 'right',
      pauseMs: 0,
    }
    expect(stepWander(state, 100, BOUNDS, half).facing).toBe('left')
  })

  test('arriving snaps to the target and starts a pause', () => {
    const state: WanderState = {
      x: 99,
      y: 0,
      tx: 100,
      ty: 0,
      facing: 'right',
      pauseMs: 0,
    }
    const next = stepWander(state, 1000, BOUNDS, half)
    expect(next.x).toBe(100)
    expect(next.pauseMs).toBeGreaterThan(0)
  })

  test('counts down a pause without moving, then picks a new target', () => {
    const paused: WanderState = {
      x: 50,
      y: 50,
      tx: 50,
      ty: 50,
      facing: 'right',
      pauseMs: 500,
    }
    const mid = stepWander(paused, 200, BOUNDS, half)
    expect(mid.pauseMs).toBe(300)
    expect(mid.x).toBe(50)

    const done = stepWander({ ...paused, pauseMs: 100 }, 200, BOUNDS, half)
    expect(done.pauseMs).toBe(0)
    // A fresh target was chosen (centre, via the half rng).
    expect(done.tx).toBe(50)
    expect(done.ty).toBe(50)
  })

  test('keeps the pet inside shrunken bounds', () => {
    const state: WanderState = {
      x: 999,
      y: 999,
      tx: 10,
      ty: 10,
      facing: 'right',
      pauseMs: 0,
    }
    const next = stepWander(state, 16, BOUNDS, half)
    expect(next.x).toBeLessThanOrEqual(BOUNDS.maxX)
    expect(next.y).toBeLessThanOrEqual(BOUNDS.maxY)
  })
})

describe('initialWander', () => {
  test('starts inside bounds with a target set', () => {
    const s = initialWander(BOUNDS, half)
    expect(s.x).toBeGreaterThanOrEqual(BOUNDS.minX)
    expect(s.x).toBeLessThanOrEqual(BOUNDS.maxX)
    expect(s.pauseMs).toBe(0)
  })
})
