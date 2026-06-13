import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import {
  getMyProfile,
  setPetCheersEnabled,
  setPetEnabled,
} from './profileService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('getMyProfile', () => {
  test('returns the row (RLS scopes it to the caller)', async () => {
    const profile = {
      user_id: 'u1',
      credits: 12,
      pet_enabled: true,
      pet_cheers_enabled: true,
      equipped_theme: null,
      equipped_pet: null,
      pets_hatched: 0,
      created_at: '2026-06-13T00:00:00Z',
    }
    supabaseMock.reset([{ data: profile, error: null }])
    expect(await getMyProfile()).toEqual(profile)
  })

  test('returns null when there is no row', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    expect(await getMyProfile()).toBeNull()
  })
})

describe('setPetEnabled', () => {
  test('updates only the pet preference', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await setPetEnabled(false)
    const update = supabaseMock.calls.find((c) => c.path.endsWith('update'))
    expect(update?.args[0]).toEqual({ pet_enabled: false })
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(setPetEnabled(true)).rejects.toThrow(/denied/)
  })
})

describe('setPetCheersEnabled', () => {
  test('updates only the cheers preference', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await setPetCheersEnabled(false)
    const update = supabaseMock.calls.find((c) => c.path.endsWith('update'))
    expect(update?.args[0]).toEqual({ pet_cheers_enabled: false })
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(setPetCheersEnabled(true)).rejects.toThrow(/denied/)
  })
})
