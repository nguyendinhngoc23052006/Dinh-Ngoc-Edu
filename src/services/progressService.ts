import { supabase } from '../lib/supabaseClient'
import { requireUserId } from './authService'

// Upsert with ignoreDuplicates keeps completion idempotent: finishing a
// lesson twice never errors and never bumps completed_at.
export async function completeNode(nodeId: string): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('node_progress')
    .upsert(
      { user_id: userId, node_id: nodeId },
      { onConflict: 'user_id,node_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

// Which of the given nodes the signed-in user finished. RLS limits rows to
// the caller, so no explicit user filter is needed.
export async function getCompletedNodeIds(
  nodeIds: string[],
): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('node_progress')
    .select('node_id')
    .in('node_id', nodeIds)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ node_id: string }>
  return new Set(rows.map((row) => row.node_id))
}
