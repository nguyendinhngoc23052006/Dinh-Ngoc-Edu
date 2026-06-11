import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../test/supabaseMock'
import { startGeneration } from './generationService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('startGeneration', () => {
  test('rejects an empty course id before touching the network', async () => {
    await expect(startGeneration('')).rejects.toThrow(/courseId/)
    expect(supabaseMock.calls).toHaveLength(0)
  })

  test('invokes the generate-course function with the course id', async () => {
    supabaseMock.reset([{ data: { status: 'processing' }, error: null }])
    await startGeneration('c1')
    const invoke = supabaseMock.calls.find((c) => c.path.endsWith('invoke'))
    expect(invoke?.args).toEqual([
      'generate-course',
      { body: { courseId: 'c1' } },
    ])
  })

  test('maps invoke failures to a readable error', async () => {
    supabaseMock.reset([{ data: null, error: { name: 'FunctionsFetchError' } }])
    await expect(startGeneration('c1')).rejects.toThrow(/could not start/i)
  })
})
