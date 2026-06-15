import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import {
  cloneCourse,
  listSavedCourseIds,
  saveCourse,
  unsaveCourse,
} from './savedCourseService'

vi.mock('../lib/supabaseClient', async () => {
  const { supabaseMock } = await import('../test/supabaseMock')
  return { supabase: supabaseMock.client }
})

beforeEach(() => supabaseMock.reset([]))

describe('saveCourse', () => {
  test('upserts idempotently (saving twice is a no-op)', async () => {
    supabaseMock.reset([sessionResult('user-1'), { data: null, error: null }])
    await saveCourse('c1')
    const upsert = supabaseMock.calls.find((c) => c.path.endsWith('upsert'))
    expect(upsert?.args[0]).toEqual({ user_id: 'user-1', course_id: 'c1' })
    expect(upsert?.args[1]).toEqual({
      onConflict: 'user_id,course_id',
      ignoreDuplicates: true,
    })
  })
})

describe('cloneCourse', () => {
  test('calls the clone_course function and returns the new course id', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: 'new-course-id', error: null },
    ])
    await expect(cloneCourse('c1')).resolves.toBe('new-course-id')
    const rpc = supabaseMock.calls.find((c) => c.path.endsWith('rpc'))
    expect(rpc?.args).toEqual(['clone_course', { source_course: 'c1' }])
  })

  test('rejects when no one is logged in', async () => {
    supabaseMock.reset([{ data: { session: null }, error: null }])
    await expect(cloneCourse('c1')).rejects.toThrow(/logged in/i)
  })

  test('surfaces database errors (e.g. a private course)', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: null, error: { message: 'Course not found.' } },
    ])
    await expect(cloneCourse('c1')).rejects.toThrow(/not found/i)
  })
})

describe('unsaveCourse', () => {
  test('deletes the saved row scoped to the user and course', async () => {
    supabaseMock.reset([sessionResult('user-1'), { data: null, error: null }])
    await unsaveCourse('c1')
    expect(supabaseMock.calls.some((c) => c.path.endsWith('delete'))).toBe(true)
    const eqArgs = supabaseMock.calls
      .filter((c) => c.path.endsWith('eq'))
      .map((c) => c.args)
    expect(eqArgs).toContainEqual(['user_id', 'user-1'])
    expect(eqArgs).toContainEqual(['course_id', 'c1'])
  })

  test('surfaces database errors', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: null, error: { message: 'denied' } },
    ])
    await expect(unsaveCourse('c1')).rejects.toThrow(/denied/)
  })
})

describe('listSavedCourseIds', () => {
  test('returns the saved course ids as a set', async () => {
    supabaseMock.reset([
      sessionResult('user-1'),
      { data: [{ course_id: 'c1' }, { course_id: 'c2' }], error: null },
    ])
    const ids = await listSavedCourseIds()
    expect(ids).toEqual(new Set(['c1', 'c2']))
  })

  test('returns an empty set when nothing is saved', async () => {
    supabaseMock.reset([sessionResult('user-1'), { data: [], error: null }])
    expect(await listSavedCourseIds()).toEqual(new Set())
  })
})
