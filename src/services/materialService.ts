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

// Supabase Storage rejects object keys with most non-ASCII characters
// ("Invalid key"), so accented file names (e.g. Vietnamese) failed to upload.
// The key gets an ASCII-safe name; the original stays in file_name. A short
// hash of the original name keeps two files that sanitize alike from
// colliding, while staying deterministic so re-uploads remain idempotent.
export function toStorageName(fileName: string): string {
  let hash = 5381
  for (let i = 0; i < fileName.length; i += 1) {
    hash = ((hash << 5) + hash + fileName.charCodeAt(i)) >>> 0
  }
  const ascii =
    fileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '_') || 'file'
  return `${hash.toString(36)}_${ascii}`
}

// Uploads to <user_id>/<course_id>/<storage_name> in the private
// 'course-materials' bucket (the storage policies scope on that first
// segment), then records the metadata row.
export async function uploadMaterial(
  courseId: string,
  file: File,
): Promise<CourseMaterial> {
  const problem = validateMaterialFile(file)
  if (problem) throw new Error(problem)
  const ownerId = await requireUserId()
  const storagePath = `${ownerId}/${courseId}/${toStorageName(file.name)}`

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
