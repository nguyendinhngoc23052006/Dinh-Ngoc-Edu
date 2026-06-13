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
