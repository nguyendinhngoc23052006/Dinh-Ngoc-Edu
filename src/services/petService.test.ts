import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import { getMyPet, hatchPet, listSpecies } from './petService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('getMyPet', () => {
  test('returns the pet row (RLS scopes it to the caller)', async () => {
    const pet = {
      user_id: 'u1',
      stage: 'egg',
      species_id: null,
      xp: 20,
      hatched_at: null,
      created_at: '2026-06-13T00:00:00Z',
    }
    supabaseMock.reset([{ data: pet, error: null }])
    expect(await getMyPet()).toEqual(pet)
  })

  test('returns null when there is no row', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    expect(await getMyPet()).toBeNull()
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(getMyPet()).rejects.toThrow(/denied/)
  })
})

describe('listSpecies', () => {
  test('returns the catalog ordered by sort', async () => {
    const rows = [{ id: 'spc-chick' }, { id: 'spc-bug' }]
    supabaseMock.reset([{ data: rows, error: null }])
    expect(await listSpecies()).toEqual(rows)
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(listSpecies()).rejects.toThrow(/denied/)
  })
})

describe('hatchPet', () => {
  test('calls the hatch RPC and returns the updated pet', async () => {
    const hatched = {
      user_id: 'u1',
      stage: 'hatched',
      species_id: 'spc-fox',
      xp: 120,
      hatched_at: '2026-06-13T01:00:00Z',
      created_at: '2026-06-13T00:00:00Z',
    }
    supabaseMock.reset([{ data: hatched, error: null }])
    expect(await hatchPet()).toEqual(hatched)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['hatch_pet'])
  })

  test('passes the RPC error message through (e.g. not ready)', async () => {
    supabaseMock.reset([
      { data: null, error: { message: 'The egg is not ready to hatch yet.' } },
    ])
    await expect(hatchPet()).rejects.toThrow(/not ready to hatch/)
  })
})
