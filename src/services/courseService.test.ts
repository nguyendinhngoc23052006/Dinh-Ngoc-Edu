import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import {
  createCourse,
  deleteCourse,
  listPublicCourses,
  renameCourse,
  validateNewCourse,
} from './courseService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('validateNewCourse', () => {
  test('accepts a normal title and known language', () => {
    expect(validateNewCourse('Biology 101', 'English')).toBeNull()
  })

  test('rejects an empty title', () => {
    expect(validateNewCourse('   ', 'English')).toMatch(/title/i)
  })

  test('rejects an unknown output language', () => {
    expect(validateNewCourse('Biology 101', 'Klingon')).toMatch(/language/i)
  })
})

describe('createCourse', () => {
  test('inserts an owner-scoped row and returns it', async () => {
    const row = { id: 'c1', title: 'Biology 101' }
    supabaseMock.reset([sessionResult('user-1'), { data: row, error: null }])
    const course = await createCourse('  Biology 101 ', 'English')
    expect(course).toEqual(row)
    const insert = supabaseMock.calls.find((c) => c.path.endsWith('insert'))
    expect(insert?.args[0]).toEqual({
      owner_id: 'user-1',
      title: 'Biology 101',
      output_language: 'English',
    })
  })

  test('rejects invalid input before touching the database', async () => {
    await expect(createCourse('', 'English')).rejects.toThrow(/title/i)
    expect(supabaseMock.calls).toHaveLength(0)
  })

  test('rejects when no one is logged in', async () => {
    supabaseMock.reset([{ data: { session: null }, error: null }])
    await expect(createCourse('Biology', 'English')).rejects.toThrow(
      /logged in/i,
    )
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: null, error: { message: 'row level security violation' } },
    ])
    await expect(createCourse('Biology', 'English')).rejects.toThrow(
      /row level security/,
    )
  })
})

describe('renameCourse', () => {
  test('rejects an unusable title before touching the database', async () => {
    await expect(renameCourse('c1', '   ')).rejects.toThrow(/title/i)
    expect(supabaseMock.calls).toHaveLength(0)
  })

  test('updates with the trimmed title', async () => {
    supabaseMock.reset([{ data: null, error: null }])
    await renameCourse('c1', '  New name ')
    const update = supabaseMock.calls.find((c) => c.path.endsWith('update'))
    expect(update?.args[0]).toEqual({ title: 'New name' })
  })
})

describe('deleteCourse', () => {
  test('surfaces database errors', async () => {
    supabaseMock.reset([
      { data: null, error: { message: 'permission denied' } },
    ])
    await expect(deleteCourse('c1')).rejects.toThrow(/permission denied/)
  })
})

describe('listPublicCourses', () => {
  test('defaults to newest-first with no filters', async () => {
    supabaseMock.reset([{ data: [], error: null }])
    await listPublicCourses()
    const order = supabaseMock.calls.find((c) => c.path.endsWith('order'))
    expect(order?.args).toEqual(['created_at', { ascending: false }])
    expect(supabaseMock.calls.some((c) => c.path.endsWith('ilike'))).toBe(false)
  })

  test('applies a title search, language filter, and title sort', async () => {
    supabaseMock.reset([{ data: [], error: null }])
    await listPublicCourses(0, {
      search: 'bio',
      language: 'English',
      sort: 'title',
    })
    expect(supabaseMock.calls.some((c) => c.path.endsWith('ilike'))).toBe(true)
    const order = supabaseMock.calls.find((c) => c.path.endsWith('order'))
    expect(order?.args).toEqual(['title', { ascending: true }])
  })

  test('escapes LIKE metacharacters so they search literally', async () => {
    supabaseMock.reset([{ data: [], error: null }])
    await listPublicCourses(0, { search: '100%' })
    const ilike = supabaseMock.calls.find((c) => c.path.endsWith('ilike'))
    expect(ilike?.args).toEqual(['title', '%100\\%%'])
  })
})
