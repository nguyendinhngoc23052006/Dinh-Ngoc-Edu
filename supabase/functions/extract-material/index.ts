// extract-material: converts one uploaded material to plain text (stored as a
// .md object beside the original) right after upload, so extraction problems
// (scanned PDFs, corrupt files) surface immediately in the upload flow — not
// minutes later as a failed AI generation — and so generate-course never has
// to parse heavy files inside its time budget.
//
// Like generate-course it runs with the CALLER's JWT (no service-role key):
// the owner RLS policies on course_materials and the storage bucket authorize
// every read and write. Extraction of a <=10 MB file is quick, so this runs
// synchronously and the response carries the outcome.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { extractFileText, MAX_FILE_BYTES } from '../_shared/extract.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false },
    },
  )
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return json({ error: 'You must be logged in.' }, 401)

  const body = await req.json().catch(() => ({}))
  const materialId = (body as { materialId?: unknown }).materialId
  if (typeof materialId !== 'string' || materialId === '') {
    return json({ error: 'materialId is required.' }, 400)
  }

  // RLS scopes the read to the caller's own rows.
  const { data: material, error } = await supabase
    .from('course_materials')
    .select('id, file_name, storage_path')
    .eq('id', materialId)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!material) return json({ error: 'Material not found.' }, 404)

  async function fail(message: string): Promise<Response> {
    await supabase
      .from('course_materials')
      .update({ extract_status: 'failed', extract_error: message.slice(0, 500) })
      .eq('id', materialId)
    return json({ status: 'failed', error: message }, 200)
  }

  const { data: blob, error: downloadError } = await supabase.storage
    .from('course-materials')
    .download(material.storage_path)
  if (downloadError || !blob) {
    return fail(`Could not read ${material.file_name}.`)
  }
  // Second weight gate behind the bucket's file_size_limit: a file slipped in
  // before the limit existed still gets rejected here.
  if (blob.size > MAX_FILE_BYTES) {
    return fail(
      `${material.file_name} is larger than 10 MB. Split it or compress it, then create the course again.`,
    )
  }

  let text: string
  try {
    text = await extractFileText(
      material.file_name,
      new Uint8Array(await blob.arrayBuffer()),
    )
  } catch (cause) {
    return fail(
      cause instanceof Error
        ? cause.message
        : `Could not read ${material.file_name}.`,
    )
  }
  if (text.trim() === '') {
    return fail(`No readable text found in ${material.file_name}.`)
  }

  // The .md lives beside the original under the same <user_id>/<course_id>/
  // prefix, so the existing owner-scoped storage policies cover it.
  const extractedPath = `${material.storage_path}.md`
  const { error: uploadError } = await supabase.storage
    .from('course-materials')
    .upload(extractedPath, new Blob([text], { type: 'text/markdown' }), {
      upsert: true,
      contentType: 'text/markdown',
    })
  if (uploadError) return fail(uploadError.message)

  const { error: updateError } = await supabase
    .from('course_materials')
    .update({
      extract_status: 'ready',
      extract_error: null,
      extracted_path: extractedPath,
      extracted_chars: text.length,
    })
    .eq('id', materialId)
  if (updateError) return json({ error: updateError.message }, 500)
  return json({ status: 'ready', chars: text.length }, 200)
})
