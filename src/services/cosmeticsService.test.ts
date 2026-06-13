import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import {
  equipCosmetic,
  listOwnedCosmeticIds,
  purchaseCosmetic,
} from './cosmeticsService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('listOwnedCosmeticIds', () => {
  test('returns the owned ids as a set', async () => {
    supabaseMock.reset([
      { data: [{ cosmetic_id: 'theme-ocean' }, { cosmetic_id: 'pet-cat' }], error: null },
    ])
    expect(await listOwnedCosmeticIds()).toEqual(
      new Set(['theme-ocean', 'pet-cat']),
    )
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(listOwnedCosmeticIds()).rejects.toThrow(/denied/)
  })
})

describe('purchaseCosmetic', () => {
  test('calls the purchase RPC and returns the new balance', async () => {
    supabaseMock.reset([{ data: 30, error: null }])
    const balance = await purchaseCosmetic('theme-ocean')
    expect(balance).toBe(30)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['purchase_cosmetic', { p_cosmetic_id: 'theme-ocean' }])
  })

  test('passes the RPC error message through (e.g. not enough credits)', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'Not enough credits.' } }])
    await expect(purchaseCosmetic('theme-midnight')).rejects.toThrow(
      /Not enough credits/,
    )
  })
})

describe('equipCosmetic', () => {
  test('equips by kind and id', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await equipCosmetic('theme', 'theme-ocean')
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual([
      'equip_cosmetic',
      { p_kind: 'theme', p_cosmetic_id: 'theme-ocean' },
    ])
  })

  test('clears a slot with null', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await equipCosmetic('pet', null)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual([
      'equip_cosmetic',
      { p_kind: 'pet', p_cosmetic_id: null },
    ])
  })
})
