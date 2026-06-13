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

// Spend owned food to add xp to a pet. The RPC checks the inventory and adds
// xp_value * qty atomically, returning the updated pet. Throws a readable
// message ("You do not have that much food.") the UI can show as-is.
export async function feedPet(
  petId: string,
  foodId: string,
  qty: number,
): Promise<Pet> {
  const { data, error } = await supabase.rpc('feed_pet', {
    p_pet_id: petId,
    p_food_id: foodId,
    p_qty: qty,
  })
  if (error) throw new Error(error.message)
  return data as Pet
}

// Release (permanently delete) a pet to free a storage slot. The RPC also
// promotes another pet into the active slot if the released one was active.
export async function releasePet(petId: string): Promise<void> {
  const { error } = await supabase.rpc('release_pet', { p_pet_id: petId })
  if (error) throw new Error(error.message)
}
