import { useEffect, useState } from 'react'
import {
  initialWander,
  stepWander,
  type Bounds,
  type Facing,
  type WanderState,
} from '../lib/petWander'

export interface PetPosition {
  x: number
  y: number
  facing: Facing
}

// The roaming area: the lower ~70% of the viewport, inset so the sprite never
// leaves the screen or covers the sticky header. Recomputed on resize.
function computeBounds(size: number): Bounds {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const top = Math.round(vh * 0.28)
  return {
    minX: 8,
    maxX: Math.max(8, vw - size - 8),
    minY: top,
    maxY: Math.max(top, vh - size - 16),
  }
}

// Drives a pet roaming across the viewport via requestAnimationFrame, delegating
// all movement math to lib/petWander. Honours prefers-reduced-motion by parking
// the pet still. `size` is the sprite's on-screen px size (kept inside bounds).
function prefersReducedMotion(): boolean {
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
}

export function usePetWander(enabled: boolean, size: number): PetPosition {
  // Seed at the resting (bottom-left) spot, which is also where the pet stays
  // under prefers-reduced-motion — so the effect never has to setState
  // synchronously just to park it.
  const [pos, setPos] = useState<PetPosition>(() => {
    const b = computeBounds(size)
    return { x: b.minX, y: b.maxY, facing: 'right' }
  })

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return
    let bounds = computeBounds(size)
    let state: WanderState = initialWander(bounds)
    let raf = 0
    let last = performance.now()
    const onResize = () => {
      bounds = computeBounds(size)
    }
    window.addEventListener('resize', onResize)

    const loop = (now: number) => {
      const dt = Math.min(now - last, 50) // clamp tab-switch / GC gaps
      last = now
      state = stepWander(state, dt, bounds)
      setPos({ x: state.x, y: state.y, facing: state.facing })
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
    }
  }, [enabled, size])

  return pos
}
