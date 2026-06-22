import { supabase } from '../lib/supabaseClient'
import type { Course, Visibility } from '../types/database'
import { requireUserId } from './authService'

export const PAGE_SIZE = 20

const OUTPUT_LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Vietnamese',
  'Chinese',
  'Japanese',
] as const

export type OutputLanguage = (typeof OUTPUT_LANGUAGES)[number]

export function listOutputLanguages(): readonly string[] {
  return OUTPUT_LANGUAGES
}

// Returns a human-readable problem, or null when the title is usable.
export function validateCourseTitle(title: string): string | null {
  if (title.trim().length === 0) return 'Give the course a title.'
  if (title.trim().length > 120) return 'Title must be 120 characters or fewer.'
  return null
}

// Returns a human-readable problem, or null when the input is usable.
export function validateNewCourse(
  title: string,
  outputLanguage: string,
): string | null {
  const titleProblem = validateCourseTitle(title)
  if (titleProblem) return titleProblem
  if (!OUTPUT_LANGUAGES.includes(outputLanguage as OutputLanguage)) {
    return 'Choose an output language from the list.'
  }
  return null
}

// Creates the course shell in 'processing' status. The AI pipeline that scans
// the materials and fills in chapters/nodes/questions is a later feature.
export async function createCourse(
  title: string,
  outputLanguage: string,
): Promise<Course> {
  const problem = validateNewCourse(title, outputLanguage)
  if (problem) throw new Error(problem)
  const ownerId = await requireUserId()
  const { data, error } = await supabase
    .from('courses')
    .insert({
      owner_id: ownerId,
      title: title.trim(),
      output_language: outputLanguage,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Course
}

export async function getCourse(courseId: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select()
    .eq('id', courseId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as Course | null
}

export async function listMyCourses(page = 0): Promise<Course[]> {
  const ownerId = await requireUserId()
  const { data, error } = await supabase
    .from('courses')
    .select()
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return (data ?? []) as Course[]
}

export type PublicCourseSort = 'recent' | 'title'

export interface PublicCourseQuery {
  search?: string
  language?: string
  sort?: PublicCourseSort
}

// The public catalogue, with optional title search, language filter, and sort.
// Always scoped to public courses and paginated, so the result set stays bounded
// however the caller filters.
export async function listPublicCourses(
  page = 0,
  query: PublicCourseQuery = {},
): Promise<Course[]> {
  let request = supabase.from('courses').select().eq('visibility', 'public')

  const search = query.search?.trim()
  // Escape the LIKE metacharacters so a user typing % or _ searches literally.
  if (search) {
    const escaped = search.replace(/[\\%_]/g, (char) => `\\${char}`)
    request = request.ilike('title', `%${escaped}%`)
  }
  if (query.language) request = request.eq('output_language', query.language)

  request =
    query.sort === 'title'
      ? request.order('title', { ascending: true })
      : request.order('created_at', { ascending: false })

  const { data, error } = await request.range(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE - 1,
  )
  if (error) throw new Error(error.message)
  return (data ?? []) as Course[]
}

export async function setCourseVisibility(
  courseId: string,
  visibility: Visibility,
): Promise<void> {
  const { error } = await supabase
    .from('courses')
    .update({ visibility })
    .eq('id', courseId)
  if (error) throw new Error(error.message)
}

export async function renameCourse(
  courseId: string,
  title: string,
): Promise<void> {
  const problem = validateCourseTitle(title)
  if (problem) throw new Error(problem)
  const { error } = await supabase
    .from('courses')
    .update({ title: title.trim() })
    .eq('id', courseId)
  if (error) throw new Error(error.message)
}

// Cascades take the materials metadata, chapters, nodes, questions, progress,
// mock tests, and bookmarks with it. The uploaded bytes stay in storage; the
// path is owner-scoped so nobody else can ever read them.
export async function deleteCourse(courseId: string): Promise<void> {
  const { error } = await supabase.from('courses').delete().eq('id', courseId)
  if (error) throw new Error(error.message)
}
