import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import { completeNode, getCompletedNodeIds } from './progressService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('completeNode', () => {
  test('upserts idempotently (duplicates ignored, never an error)', async () => {
    supabaseMock.reset([sessionResult('user-1'), { data: null, error: null }])
    await completeNode('n1')
    const upsert = supabaseMock.calls.find((c) => c.path.endsWith('upsert'))
    expect(upsert?.args[0]).toEqual({ user_id: 'user-1', node_id: 'n1' })
    expect(upsert?.args[1]).toEqual({
      onConflict: 'user_id,node_id',
      ignoreDuplicates: true,
    })
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: null, error: { message: 'permission denied' } },
    ])
    await expect(completeNode('n1')).rejects.toThrow(/permission denied/)
  })
})

describe('getCompletedNodeIds', () => {
  test('returns the completed subset as a set', async () => {
    supabaseMock.reset([
      { data: [{ node_id: 'n1' }, { node_id: 'n3' }], error: null },
    ])
    const completed = await getCompletedNodeIds(['n1', 'n2', 'n3'])
    expect(completed).toEqual(new Set(['n1', 'n3']))
  })

  test('skips the query entirely for an empty node list', async () => {
    const completed = await getCompletedNodeIds([])
    expect(completed).toEqual(new Set())
    expect(supabaseMock.calls).toHaveLength(0)
  })
})
