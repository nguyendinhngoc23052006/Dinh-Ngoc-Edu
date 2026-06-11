import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import {
  createMockTest,
  getMockTestQuestions,
  validateNewMockTest,
} from './mockTestService'
import type { MockTest } from '../types/database'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

const baseTest: MockTest = {
  id: 't1',
  course_id: 'c1',
  owner_id: 'user-1',
  title: 'Dry run',
  chapter_ids: ['ch1', 'ch2'],
  created_at: '2026-06-10T00:00:00Z',
}

describe('validateNewMockTest', () => {
  test('accepts a title and at least one chapter', () => {
    expect(validateNewMockTest('Dry run', ['ch1'])).toBeNull()
  })

  test('rejects an empty title', () => {
    expect(validateNewMockTest('  ', ['ch1'])).toMatch(/title/i)
  })

  test('rejects an empty chapter selection', () => {
    expect(validateNewMockTest('Dry run', [])).toMatch(/chapter/i)
  })

  test('rejects an oversized chapter selection', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `ch${i}`)
    expect(validateNewMockTest('Dry run', ids)).toMatch(/at most/i)
  })
})

describe('createMockTest', () => {
  test('rejects invalid input before touching the database', async () => {
    await expect(createMockTest('c1', 'Dry run', [])).rejects.toThrow(
      /chapter/i,
    )
    expect(supabaseMock.calls).toHaveLength(0)
  })

  test('inserts the chosen chapters for the signed-in user', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: [{ id: 'ch1' }, { id: 'ch2' }], error: null },
      { data: baseTest, error: null },
    ])
    const created = await createMockTest('c1', 'Dry run', ['ch1', 'ch2'])
    expect(created).toEqual(baseTest)
    const insert = supabaseMock.calls.find((c) => c.path.endsWith('insert'))
    expect(insert?.args[0]).toEqual({
      course_id: 'c1',
      owner_id: 'user-1',
      title: 'Dry run',
      chapter_ids: ['ch1', 'ch2'],
    })
  })

  test('rejects chapters that do not belong to the course', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: [{ id: 'ch1' }], error: null }, // ch2 not in this course
    ])
    await expect(
      createMockTest('c1', 'Dry run', ['ch1', 'ch2']),
    ).rejects.toThrow(/belong/i)
    expect(
      supabaseMock.calls.find((c) => c.path.endsWith('insert')),
    ).toBeUndefined()
  })
})

describe('getMockTestQuestions', () => {
  test('loads questions for the nodes of the chosen chapters', async () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }]
    supabaseMock.reset([
      { data: [{ id: 'n1' }, { id: 'n2' }], error: null },
      { data: questions, error: null },
    ])
    await expect(getMockTestQuestions(baseTest)).resolves.toEqual(questions)
  })

  test('returns empty when the chapters have no nodes', async () => {
    supabaseMock.reset([{ data: [], error: null }])
    await expect(getMockTestQuestions(baseTest)).resolves.toEqual([])
  })
})
