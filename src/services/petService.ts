import { supabase } from '../lib/supabaseClient'
import type { Species, UserPet } from '../types/database'

// The signed-in user's one pet (egg or hatched). RLS scopes the row to the
// caller; the row is created by the signup trigger, so a migrated account
// always has one. Returns null when logged out / not yet provisioned.
export async function getMyPet(): Promise<UserPet | null> {
  const { data, error } = await supabase.from('user_pet').select().maybeSingle()
  if (error) throw new Error(error.message)
  return (data as UserPet | null) ?? null
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

// Hatch the egg: the RPC rolls a random species (weighted by rarity) and flips
// the pet to hatched atomically, server-side. Throws a readable message ("The
// egg is not ready to hatch yet.", "Your pet has already hatched.") the UI can
// show as-is. Returns the updated pet row.
export async function hatchPet(): Promise<UserPet> {
  const { data, error } = await supabase.rpc('hatch_pet')
  if (error) throw new Error(error.message)
  return data as UserPet
}
