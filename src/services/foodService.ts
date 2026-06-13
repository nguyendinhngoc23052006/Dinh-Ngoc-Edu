import { supabase } from '../lib/supabaseClient'
import type { Food } from '../types/database'

// The food catalog (all tiers). Small, static, world-readable; ordered for
// display and bounded (seeded by migration).
export async function listFood(): Promise<Food[]> {
  const { data, error } = await supabase
    .from('food')
    .select()
    .order('sort', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return (data ?? []) as Food[]
}

// The signed-in user's stockpile as food_id → quantity. RLS scopes the rows to
// the caller; bounded by the catalog size.
export async function listMyFood(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from('user_food')
    .select('food_id, qty')
    .limit(200)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ food_id: string; qty: number }>
  return new Map(rows.map((row) => [row.food_id, row.qty]))
}

// Buy food: the RPC deducts credits and adds to the stockpile atomically and
// returns the new balance. Throws a readable message ("Not enough credits.")
// the UI can show as-is.
export async function buyFood(foodId: string, qty: number): Promise<number> {
  const { data, error } = await supabase.rpc('buy_food', {
    p_food_id: foodId,
    p_qty: qty,
  })
  if (error) throw new Error(error.message)
  return typeof data === 'number' ? data : 0
}
