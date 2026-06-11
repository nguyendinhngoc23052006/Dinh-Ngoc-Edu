import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

// Kicks off the generate-course Edge Function for a course the caller owns.
// The function answers immediately and works in the background; CoursePage
// polls course.status until it leaves 'processing'.
export async function startGeneration(courseId: string): Promise<void> {
  if (courseId === '') throw new Error('courseId is required.')
  const { error } = await supabase.functions.invoke('generate-course', {
    body: { courseId },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = (await error.context.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(detail?.error ?? 'Could not start course generation.')
    }
    throw new Error('Could not start course generation.')
  }
}
