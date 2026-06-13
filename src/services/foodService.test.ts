import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import { buyFood, listFood, listMyFood } from './foodService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('listFood', () => {
  test('returns the catalog ordered by sort', async () => {
    const rows = [{ id: 'food-berry' }, { id: 'food-meal' }]
    supabaseMock.reset([{ data: rows, error: null }])
    expect(await listFood()).toEqual(rows)
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(listFood()).rejects.toThrow(/denied/)
  })
})

describe('listMyFood', () => {
  test('returns the stockpile as a food_id → qty map', async () => {
    supabaseMock.reset([
      {
        data: [
          { food_id: 'food-berry', qty: 4 },
          { food_id: 'food-feast', qty: 1 },
        ],
        error: null,
      },
    ])
    expect(await listMyFood()).toEqual(
      new Map([
        ['food-berry', 4],
        ['food-feast', 1],
      ]),
    )
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(listMyFood()).rejects.toThrow(/denied/)
  })
})

describe('buyFood', () => {
  test('calls the buy RPC and returns the new balance', async () => {
    supabaseMock.reset([{ data: 80, error: null }])
    expect(await buyFood('food-meal', 2)).toBe(80)
    const rpc = supabaseMock.calls.find((c) => c.path === 'rpc')
    expect(rpc?.args).toEqual(['buy_food', { p_food_id: 'food-meal', p_qty: 2 }])
  })

  test('passes the RPC error through (e.g. not enough credits)', async () => {
    supabaseMock.reset([
      { data: null, error: { message: 'Not enough credits.' } },
    ])
    await expect(buyFood('food-feast', 1)).rejects.toThrow(/Not enough credits/)
  })
})
