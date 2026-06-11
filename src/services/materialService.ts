import { supabase } from '../lib/supabaseClient'
import { requireUserId } from './authService'
import type { CourseMaterial } from '../types/database'

const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20 MB
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'docx', 'pptx']

// Returns a human-readable problem, or null when the file is acceptable.
export function validateMaterialFile(file: {
  name: string
  size: number
}): string | null {
  // The name becomes the last segment of the storage key — no path tricks.
  if (file.name.includes('/') || file.name.includes('\\')) {
    return 'File names must not contain slashes.'
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `Unsupported file type. Use: ${ALLOWED_EXTENSIONS.join(', ')}.`
  }
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_FILE_BYTES) return 'Files must be 20 MB or smaller.'
  return null
}

// Uploads to <user_id>/<course_id>/<file_name> in the private
// 'course-materials' bucket (the storage policies scope on that first
// segment), then records the metadata row.
export async function uploadMaterial(
  courseId: string,
  file: File,
): Promise<CourseMaterial> {
  const problem = validateMaterialFile(file)
  if (problem) throw new Error(problem)
  const ownerId = await requireUserId()
  const storagePath = `${ownerId}/${courseId}/${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(storagePath, file, { upsert: true })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await supabase
    .from('course_materials')
    .upsert(
      {
        course_id: courseId,
        owner_id: ownerId,
        file_name: file.name,
        storage_path: storagePath,
      },
      { onConflict: 'course_id,storage_path' },
    )
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as CourseMaterial
}

export async function listMaterials(
  courseId: string,
): Promise<CourseMaterial[]> {
  const { data, error } = await supabase
    .from('course_materials')
    .select()
    .eq('course_id', courseId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []) as CourseMaterial[]
}
