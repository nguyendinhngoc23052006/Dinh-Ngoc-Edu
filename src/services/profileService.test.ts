import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import {
  getDisplayNames,
  getMyProfile,
  setDisplayName,
  setPetCheersEnabled,
  setPetEnabled,
  validateDisplayName,
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
      display_name: null,
      equipped_theme: null,
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

describe('validateDisplayName', () => {
  test('accepts a normal name', () => {
    expect(validateDisplayName('Ada Lovelace')).toBeNull()
  })
  test('rejects an empty / whitespace name', () => {
    expect(validateDisplayName('   ')).toMatch(/enter a display name/i)
  })
  test('rejects a name over 50 characters', () => {
    expect(validateDisplayName('x'.repeat(51))).toMatch(/under 50/)
  })
})

describe('setDisplayName', () => {
  test('rejects an invalid name without calling the API', async () => {
    await expect(setDisplayName('   ')).rejects.toThrow(/enter a display name/i)
    expect(supabaseMock.calls.some((c) => c.path.endsWith('update'))).toBe(false)
  })

  test('trims, updates display_name, and returns the trimmed value', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    expect(await setDisplayName('  Ada  ')).toBe('Ada')
    const update = supabaseMock.calls.find((c) => c.path.endsWith('update'))
    expect(update?.args[0]).toEqual({ display_name: 'Ada' })
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([{ data: null, error: { message: 'denied' } }])
    await expect(setDisplayName('Ada')).rejects.toThrow(/denied/)
  })
})

describe('getDisplayNames', () => {
  test('returns an empty map without querying when given no ids', async () => {
    await expect(getDisplayNames([])).resolves.toEqual(new Map())
    expect(supabaseMock.calls).toHaveLength(0)
  })

  test('maps user_id to name and drops rows with no name', async () => {
    supabaseMock.reset([
      {
        data: [
          { user_id: 'u1', display_name: 'Ada' },
          { user_id: 'u2', display_name: null },
        ],
        error: null,
      },
    ])
    const names = await getDisplayNames(['u1', 'u2', 'u1'])
    expect(names.get('u1')).toBe('Ada')
    expect(names.has('u2')).toBe(false)
  })
})
