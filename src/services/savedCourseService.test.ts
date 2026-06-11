import { beforeEach, describe, expect, test, vi } from 'vitest'
import { supabaseMock, sessionResult } from '../test/supabaseMock'
import { cloneCourse, saveCourse } from './savedCourseService'

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
