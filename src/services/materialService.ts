import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { requireUserId } from './authService'
import type { CourseMaterial } from '../types/database'

// Mirrors the course-materials bucket's file_size_limit and allowed_mime_types
// (migration 20260612090000) — this check is the friendly message, the bucket
// is the enforcement.
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'docx', 'pptx']

// Browsers leave file.type empty for some extensions (.md notably); the bucket
// rejects unknown MIME types, so the upload always states one by extension.
const MIME_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

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
  if (file.size > MAX_FILE_BYTES) return 'Files must be 10 MB or smaller.'
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
// segment), records the metadata row, then runs text extraction so an
// unreadable file (e.g. a scanned PDF) fails HERE, not minutes later inside
// the AI generation run.
export async function uploadMaterial(
  courseId: string,
  file: File,
): Promise<CourseMaterial> {
  const problem = validateMaterialFile(file)
  if (problem) throw new Error(problem)
  const ownerId = await requireUserId()
  const storagePath = `${ownerId}/${courseId}/${toStorageName(file.name)}`
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''

  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(storagePath, file, {
      upsert: true,
      contentType: MIME_BY_EXTENSION[extension],
    })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await supabase
    .from('course_materials')
    .upsert(
      {
        course_id: courseId,
        owner_id: ownerId,
        file_name: file.name,
        storage_path: storagePath,
        // A re-upload replaces the bytes; the previous extraction no longer
        // describes them, so it runs again below.
        extract_status: 'pending',
        extract_error: null,
      },
      { onConflict: 'course_id,storage_path' },
    )
    .select()
    .single()
  if (error) throw new Error(error.message)
  const material = data as CourseMaterial

  const { data: extracted, error: extractError } =
    await supabase.functions.invoke('extract-material', {
      body: { materialId: material.id },
    })
  if (extractError) {
    if (extractError instanceof FunctionsHttpError) {
      const detail = (await extractError.context.json().catch(() => null)) as {
        error?: string
      } | null
      throw new Error(detail?.error ?? `Could not process ${file.name}.`)
    }
    throw new Error(`Could not process ${file.name}.`)
  }
  const outcome = extracted as { status?: string; error?: string } | null
  if (outcome?.status === 'failed') {
    throw new Error(outcome.error ?? `Could not process ${file.name}.`)
  }
  return material
}

// Removes a material after course creation: the stored bytes first, then the
// metadata row. If the storage delete fails we stop and surface it rather than
// orphaning a file whose row is gone. RLS (and the owner-scoped storage path)
// keep this to the caller's own files.
export async function deleteMaterial(
  material: Pick<CourseMaterial, 'id' | 'storage_path'>,
): Promise<void> {
  const { error: storageError } = await supabase.storage
    .from('course-materials')
    .remove([material.storage_path])
  if (storageError) throw new Error(storageError.message)
  const { error } = await supabase
    .from('course_materials')
    .delete()
    .eq('id', material.id)
  if (error) throw new Error(error.message)
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
