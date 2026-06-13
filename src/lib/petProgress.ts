import type { PetStage } from '../types/database'

// Pure pet progression math — no Supabase, no React. The pet's evolution form
// is DERIVED from its xp here (never stored), so the server only ever writes a
// growing xp number and this is the single source of truth for what that xp
// means. EGG_HATCH_XP MUST match the threshold in
// supabase/migrations/...pet_system_foundation.sql (the hatch RPC).

export const EGG_HATCH_XP = 100
export const FORM2_XP = 300
export const FORM3_XP = 700

export type PetForm = 1 | 2 | 3

// Can the egg hatch yet? (Feeding raises xp; the hatch RPC enforces the same
// rule server-side.)
export function eggReady(xp: number): boolean {
  return xp >= EGG_HATCH_XP
}

// Which evolution form a hatched pet is showing, from its xp.
export function petForm(xp: number): PetForm {
  if (xp >= FORM3_XP) return 3
  if (xp >= FORM2_XP) return 2
  return 1
}

export interface PetProgress {
  // What the current xp band is filling toward.
  toward: 'hatch' | 'form2' | 'form3' | 'max'
  // xp accumulated within the current band, and the band's width. For a fully
  // evolved pet, atMax is true and need is 0.
  have: number
  need: number
  atMax: boolean
}

// Progress toward the next milestone, for a progress bar. An egg fills toward
// hatching; a hatched pet fills toward its next form, then sits at max. `have`
// can exceed `need` for a ready-but-unhatched egg (the UI clamps the bar).
export function petProgress(stage: PetStage, xp: number): PetProgress {
  if (stage === 'egg') {
    return { toward: 'hatch', have: xp, need: EGG_HATCH_XP, atMax: false }
  }
  if (xp < FORM2_XP) {
    return {
      toward: 'form2',
      have: xp - EGG_HATCH_XP,
      need: FORM2_XP - EGG_HATCH_XP,
      atMax: false,
    }
  }
  if (xp < FORM3_XP) {
    return {
      toward: 'form3',
      have: xp - FORM2_XP,
      need: FORM3_XP - FORM2_XP,
      atMax: false,
    }
  }
  return { toward: 'max', have: 0, need: 0, atMax: true }
}
