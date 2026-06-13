import { supabase } from '../lib/supabaseClient'
import type { Pet, Species } from '../types/database'

// The signed-in user's pets — their storage (≤ 3). RLS scopes the rows to the
// caller; oldest first for a stable display. Bounded by definition.
export async function listMyPets(): Promise<Pet[]> {
  const { data, error } = await supabase
    .from('pets')
    .select()
    .order('created_at', { ascending: true })
    .limit(3)
  if (error) throw new Error(error.message)
  return (data ?? []) as Pet[]
}

// The species catalog (all hatchable creatures). Small, static, world-readable;
// ordered for display and bounded (seeded by migration).
export async function listSpecies(): Promise<Species[]> {
  const { data, error } = await supabase
    .from('species')
    .select()
    .order('sort', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as Species[]
}

// Adopt a new egg. The RPC refuses past three pets ("Your storage is full…"),
// throwing a readable message the UI can show as-is. Returns the new pet row.
export async function adoptPet(): Promise<Pet> {
  const { data, error } = await supabase.rpc('adopt_pet')
  if (error) throw new Error(error.message)
  return data as Pet
}

// Hatch an egg: the RPC rolls a random species (weighted by rarity) and flips
// the pet to hatched atomically, server-side. Throws a readable message ("The
// egg is not ready to hatch yet.", "Your pet has already hatched.") the UI can
// show as-is. Returns the updated pet row.
export async function hatchPet(petId: string): Promise<Pet> {
  const { data, error } = await supabase.rpc('hatch_pet', { p_pet_id: petId })
  if (error) throw new Error(error.message)
  return data as Pet
}

// Make this pet the single on-screen companion (clears any other active flag).
export async function setActivePet(petId: string): Promise<void> {
  const { error } = await supabase.rpc('set_active_pet', { p_pet_id: petId })
  if (error) throw new Error(error.message)
}

// Release (permanently delete) a pet to free a storage slot. RLS scopes the
// delete to the caller's own rows.
export async function releasePet(petId: string): Promise<void> {
  const { error } = await supabase.from('pets').delete().eq('id', petId)
  if (error) throw new Error(error.message)
}
