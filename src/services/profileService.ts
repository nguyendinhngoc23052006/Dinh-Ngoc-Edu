import { supabase } from '../lib/supabaseClient'
import type { Profile } from '../types/database'

// The signed-in user's profile (credits + cosmetic prefs). RLS scopes the row
// to the caller; the row itself is created by a signup trigger, so a freshly
// migrated account always has one. Returns null when logged out.
export async function getMyProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select().maybeSingle()
  if (error) throw new Error(error.message)
  return (data as Profile | null) ?? null
}

// Toggles the walking-pet preference. Only the two pet preference columns are
// client-writable (credits and equipped slots are server-controlled).
export async function setPetEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ pet_enabled: enabled })
    .not('user_id', 'is', null)
  if (error) throw new Error(error.message)
}

// Toggles the pet's encouragement messages. Client-writable like pet_enabled.
export async function setPetCheersEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ pet_cheers_enabled: enabled })
    .not('user_id', 'is', null)
  if (error) throw new Error(error.message)
}

const MAX_DISPLAY_NAME = 50

// Returns a human-readable problem with the display name, or null when usable.
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Enter a display name.'
  if (trimmed.length > MAX_DISPLAY_NAME) {
    return `Keep your display name under ${MAX_DISPLAY_NAME} characters.`
  }
  return null
}

// Sets the caller's public author label. display_name is in the column-level
// update grant, so this is the only profile field besides the pet prefs a
// client may write. Returns the saved (trimmed) value.
export async function setDisplayName(name: string): Promise<string> {
  const problem = validateDisplayName(name)
  if (problem) throw new Error(problem)
  const trimmed = name.trim()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: trimmed })
    .not('user_id', 'is', null)
  if (error) throw new Error(error.message)
  return trimmed
}

// Display names for a set of users, as user_id → name. Reads the public_profiles
// view (only public-course authors are visible there), so it works for any
// viewer. One query for the whole set — callers pass a page's worth of owner
// ids, so there's no N+1.
export async function getDisplayNames(
  userIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return new Map()
  const { data, error } = await supabase
    .from('public_profiles')
    .select('user_id, display_name')
    .in('user_id', unique)
    .limit(200)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{
    user_id: string
    display_name: string | null
  }>
  return new Map(
    rows
      .filter((row): row is { user_id: string; display_name: string } =>
        Boolean(row.display_name),
      )
      .map((row) => [row.user_id, row.display_name]),
  )
}
