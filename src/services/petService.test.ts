import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import {
  adoptPet,
  hatchPet,
  listMyPets,
  listSpecies,
  releasePet,
  setActivePet,
} from './petService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

const egg = {
  id: 'p1',
  user_id: 'u1',
  stage: 'egg',
  species_id: null,
  xp: 20,
  is_active: true,
  hatched_at: null,
  created_at: '2026-06-13T00:00:00Z',
}

describe('listMyPets', () => {
  test('returns the storage rows (RLS scopes them to the caller)', async () => {
    supabaseMock.reset([{ data: [egg], error: null }])
    expect(await listMyPets()).toEqual([egg])
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(listMyPets()).rejects.toThrow(/denied/)
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

describe('adoptPet', () => {
  test('calls the adopt RPC and returns the new pet', async () => {
    supabaseMock.reset([{ data: egg, error: null }])
    expect(await adoptPet()).toEqual(egg)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['adopt_pet'])
  })

  test('passes the RPC error through (e.g. storage full)', async () => {
    supabaseMock.reset([
      { data: null, error: { message: 'Your storage is full (3 pets). Release one first.' } },
    ])
    await expect(adoptPet()).rejects.toThrow(/storage is full/)
  })
})

describe('hatchPet', () => {
  test('calls the hatch RPC with the pet id and returns the updated pet', async () => {
    const hatched = { ...egg, stage: 'hatched', species_id: 'spc-fox', xp: 120 }
    supabaseMock.reset([{ data: hatched, error: null }])
    expect(await hatchPet('p1')).toEqual(hatched)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['hatch_pet', { p_pet_id: 'p1' }])
  })

  test('passes the RPC error message through (e.g. not ready)', async () => {
    supabaseMock.reset([
      { data: null, error: { message: 'The egg is not ready to hatch yet.' } },
    ])
    await expect(hatchPet('p1')).rejects.toThrow(/not ready to hatch/)
  })
})

describe('setActivePet', () => {
  test('calls the RPC with the pet id', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await setActivePet('p2')
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['set_active_pet', { p_pet_id: 'p2' }])
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'No such pet.' } }])
    await expect(setActivePet('p2')).rejects.toThrow(/No such pet/)
  })
})

describe('releasePet', () => {
  test('deletes the pet by id', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await releasePet('p3')
    const del = supabaseMock.calls.find((c) => c.path.endsWith('eq'))
    expect(del?.args).toEqual(['id', 'p3'])
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(releasePet('p3')).rejects.toThrow(/denied/)
  })
})
