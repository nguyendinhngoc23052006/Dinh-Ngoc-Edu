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

// Deep-copies a viewable course (chapters, nodes, questions, fresh ids) into
// the caller's account via the clone_course database function, so the copy
// stays usable even if the original is deleted or made private again.
export async function cloneCourse(courseId: string): Promise<string> {
  await requireUserId()
  const { data, error } = await supabase.rpc('clone_course', {
    source_course: courseId,
  })
  if (error) throw new Error(error.message)
  return data as string
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

// The set of course ids the caller has saved, so a list (e.g. Explore) can show
// the correct Save/Saved state on load instead of resetting every visit. Bounded
// by a generous cap; saves are personal, so this stays small in practice.
export async function listSavedCourseIds(): Promise<Set<string>> {
  const userId = await requireUserId()
  const { data, error } = await supabase
    .from('saved_courses')
    .select('course_id')
    .eq('user_id', userId)
    .limit(500)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ course_id: string }>
  return new Set(rows.map((row) => row.course_id))
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
