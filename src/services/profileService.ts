import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types/database'

// The signed-in user's profile (credits + cosmetic prefs). RLS scopes the row
// to the caller; the row itself is created by a signup trigger, so a freshly
// migrated account always has one. Returns null when logged out.
export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select()
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Profile | null) ?? null
}

// Toggles the walking-pet preference. Only this column is client-writable
// (credits and equipped slots are server-controlled).
export async function setPetEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ pet_enabled: enabled })
    .not('user_id', 'is', null)
  if (error) throw new Error(error.message)
}
