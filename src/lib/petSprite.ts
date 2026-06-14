import type { PetForm } from './petProgress'

// Pure sprite presentation math — no DOM, no React — so it can be unit-tested.
// The actual <img>/CSS lives in components/pet/PetSprite.tsx.

// Each species' walking spritesheet lives in /public keyed by species id, so the
// renderer resolves it by convention (no extra DB column). A missing/failed file
// falls back to the species emoji in the component.
export function petSpriteUrl(speciesId: string): string {
  return `/pets/${speciesId}.png`
}

// A pet grows as it evolves: form 1 is small, form 3 is large. Multiplies the
// base on-screen size.
export function petFormScale(form: PetForm): number {
  if (form === 3) return 1.75
  if (form === 2) return 1.35
  return 1
}

// …and reads as "leveled up": a CSS filter that deepens colour and adds a touch
// of glow per form, without changing the creature's hue (which would break its
// identity). Form 1 is the plain sprite.
export function petFormFilter(form: PetForm): string {
  if (form === 3)
    return 'saturate(1.5) brightness(1.08) drop-shadow(0 0 3px rgba(22,163,74,0.55))'
  if (form === 2) return 'saturate(1.25) brightness(1.04)'
  return 'none'
}
