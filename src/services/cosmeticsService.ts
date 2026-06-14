import { supabase } from '../lib/supabaseClient'
import type { Cosmetic, CosmeticKind } from '../types/database'

// The whole catalog (themes + pets). Small and static, world-readable; ordered
// for display. Bounded by definition (seeded by migration).
export async function listCosmetics(): Promise<Cosmetic[]> {
  const { data, error } = await supabase
    .from('cosmetics')
    .select()
    .order('kind', { ascending: true })
    .order('sort', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as Cosmetic[]
}

// The cosmetic ids the signed-in user owns. RLS scopes to the caller.
export async function listOwnedCosmeticIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('user_cosmetics')
    .select('cosmetic_id')
    .limit(500)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ cosmetic_id: string }>
  return new Set(rows.map((row) => row.cosmetic_id))
}

// Buys a cosmetic; the RPC deducts credits and grants ownership atomically and
// returns the new balance. Throws a readable message ("Not enough credits.",
// "You already own this.") the UI can show as-is. The idempotency key makes a
// retried call a no-op server-side, so a lost response can't double-charge.
export async function purchaseCosmetic(
  cosmeticId: string,
  idempotencyKey: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('purchase_cosmetic', {
    p_cosmetic_id: cosmeticId,
    p_idempotency_key: idempotencyKey,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}

// Equips a cosmetic into its kind's slot, or clears it with null.
export async function equipCosmetic(
  kind: CosmeticKind,
  cosmeticId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('equip_cosmetic', {
    p_kind: kind,
    p_cosmetic_id: cosmeticId,
  })
  if (error) throw new Error(error.message)
}
