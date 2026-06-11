import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import {
  createMockTest,
  getMockTestQuestions,
  sampleQuestions,
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
  question_count: 20,
  created_at: '2026-06-10T00:00:00Z',
}

describe('validateNewMockTest', () => {
  test('accepts a title, at least one chapter, and a sane count', () => {
    expect(validateNewMockTest('Dry run', ['ch1'], 10)).toBeNull()
  })

  test('rejects an empty title', () => {
    expect(validateNewMockTest('  ', ['ch1'], 10)).toMatch(/title/i)
  })

  test('rejects an empty chapter selection', () => {
    expect(validateNewMockTest('Dry run', [], 10)).toMatch(/chapter/i)
  })

  test('rejects an oversized chapter selection', () => {
    const ids = Array.from({ length: 51 }, (_, i) => `ch${i}`)
    expect(validateNewMockTest('Dry run', ids, 10)).toMatch(/at most/i)
  })

  test('rejects out-of-range or fractional question counts', () => {
    expect(validateNewMockTest('Dry run', ['ch1'], 0)).toMatch(/between/i)
    expect(validateNewMockTest('Dry run', ['ch1'], 101)).toMatch(/between/i)
    expect(validateNewMockTest('Dry run', ['ch1'], 2.5)).toMatch(/between/i)
  })
})

describe('createMockTest', () => {
  test('rejects invalid input before touching the database', async () => {
    await expect(createMockTest('c1', 'Dry run', [], 10)).rejects.toThrow(
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
    const created = await createMockTest('c1', 'Dry run', ['ch1', 'ch2'], 20)
    expect(created).toEqual(baseTest)
    const insert = supabaseMock.calls.find((c) => c.path.endsWith('insert'))
    expect(insert?.args[0]).toEqual({
      course_id: 'c1',
      owner_id: 'user-1',
      title: 'Dry run',
      chapter_ids: ['ch1', 'ch2'],
      question_count: 20,
    })
  })

  test('rejects chapters that do not belong to the course', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: [{ id: 'ch1' }], error: null }, // ch2 not in this course
    ])
    await expect(
      createMockTest('c1', 'Dry run', ['ch1', 'ch2'], 20),
    ).rejects.toThrow(/belong/i)
    expect(
      supabaseMock.calls.find((c) => c.path.endsWith('insert')),
    ).toBeUndefined()
  })
})

describe('sampleQuestions', () => {
  test('draws the requested number without duplicates', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const picked = sampleQuestions(items, 3)
    expect(picked).toHaveLength(3)
    expect(new Set(picked).size).toBe(3)
    for (const item of picked) expect(items).toContain(item)
  })

  test('returns everything when fewer candidates than requested', () => {
    expect(sampleQuestions(['a', 'b'], 10)).toHaveLength(2)
  })

  test('shuffles deterministically with an injected random source', () => {
    // random() === 0 swaps each element to the front: [1,2,3] -> [2,3,1].
    expect(sampleQuestions([1, 2, 3], 3, () => 0)).toEqual([2, 3, 1])
  })
})

describe('getMockTestQuestions', () => {
  test('samples the requested number from the chapters’ questions', async () => {
    const questions = Array.from({ length: 30 }, (_, i) => ({ id: `q${i}` }))
    supabaseMock.reset([
      { data: [{ id: 'n1' }, { id: 'n2' }], error: null },
      { data: questions, error: null },
    ])
    const picked = await getMockTestQuestions(baseTest)
    expect(picked).toHaveLength(20)
    expect(new Set(picked.map((q) => q.id)).size).toBe(20)
  })

  test('returns all questions when fewer exist than requested', async () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }]
    supabaseMock.reset([
      { data: [{ id: 'n1' }, { id: 'n2' }], error: null },
      { data: questions, error: null },
    ])
    await expect(getMockTestQuestions(baseTest)).resolves.toHaveLength(2)
  })

  test('returns empty when the chapters have no nodes', async () => {
    supabaseMock.reset([{ data: [], error: null }])
    await expect(getMockTestQuestions(baseTest)).resolves.toEqual([])
  })
})
