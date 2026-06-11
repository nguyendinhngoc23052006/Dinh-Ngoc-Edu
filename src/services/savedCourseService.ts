import { supabase } from '../lib/supabaseClient'
import { requireUserId } from './authService'
import { PAGE_SIZE } from './courseService'
import type { Course } from '../types/database'

// Upsert keeps saving idempotent: saving twice is a no-op, never an error.
export async function saveCourse(courseId: string): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('saved_courses')
    .upsert(
      { user_id: userId, course_id: courseId },
      { onConflict: 'user_id,course_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

export async function unsaveCourse(courseId: string): Promise<void> {
  const userId = await requireUserId()
  const { error } = await supabase
    .from('saved_courses')
    .delete()
    .eq('user_id', userId)
    .eq('course_id', courseId)
  if (error) throw new Error(error.message)
}

export async function listSavedCourses(page = 0): Promise<Course[]> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('saved_courses')
    .select('course:courses(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<{ course: Course | null }>
  return rows.flatMap((row) => (row.course ? [row.course] : []))
}
