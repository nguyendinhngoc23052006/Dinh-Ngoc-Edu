// generate-course: the AI pipeline that turns a course's uploaded materials
// into chapters -> nodes -> questions, then flips the course to ready/failed.
//
// It runs with the CALLER's JWT (no service-role key): the existing RLS owner
// policies authorize every read and write, so the function cannot touch a
// course its caller does not own. The heavy work runs in the background via
// EdgeRuntime.waitUntil; the client gets a 202 and polls course.status.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   AI_API_KEY   required — key for an OpenAI-compatible chat completions API
//   AI_BASE_URL  optional — default Gemini's free-tier OpenAI-compatible URL
//   AI_MODEL     optional — default gemini-2.5-flash

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { strFromU8, unzipSync } from 'npm:fflate@0.8.2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import {
  buildQuestionsPrompt,
  buildSyllabusPrompt,
  chunkText,
  extractXmlText,
  parseJsonLoose,
  validateQuestions,
  validateSyllabus,
  verifyQuestion,
} from './pipeline.ts'
import type { GeneratedQuestion } from './pipeline.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_SOURCE_CHARS = 200_000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface CourseRow {
  id: string
  owner_id: string
  output_language: string
  status: string
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Generation failed.'
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
  const courseId = (body as { courseId?: unknown }).courseId
  if (typeof courseId !== 'string' || courseId === '') {
    return json({ error: 'courseId is required.' }, 400)
  }

  const { data: course, error } = await supabase
    .from('courses')
    .select('id, owner_id, output_language, status')
    .eq('id', courseId)
    .maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!course || course.owner_id !== userData.user.id) {
    return json({ error: 'Course not found.' }, 404)
  }
  // Re-running on a finished course is a no-op, so a double click or a retry
  // after a network blip never regenerates (and never double-bills the key).
  if (course.status === 'ready') return json({ status: 'ready' }, 200)
  if (!Deno.env.get('AI_API_KEY')) {
    return json(
      { error: 'AI_API_KEY is not configured (Edge Function secrets).' },
      500,
    )
  }

  EdgeRuntime.waitUntil(generate(supabase, course))
  return json({ status: 'processing' }, 202)
})

async function generate(
  supabase: SupabaseClient,
  course: CourseRow,
): Promise<void> {
  try {
    await supabase
      .from('courses')
      .update({ status: 'processing', generation_error: null })
      .eq('id', course.id)
    // A failed or interrupted earlier run may have left partial content;
    // wiping the chapters (cascades to nodes/questions) makes retries clean.
    await supabase.from('chapters').delete().eq('course_id', course.id)

    const text = await extractMaterialsText(supabase, course.id)
    const chunks = chunkText(text.slice(0, MAX_SOURCE_CHARS))
    if (chunks.length === 0) {
      throw new Error('No readable text found in the uploaded materials.')
    }

    const language = course.output_language
    const syllabus = validateSyllabus(
      parseJsonLoose(await chat(buildSyllabusPrompt(chunks, language))),
      chunks.length,
    )

    for (const [chapterIndex, chapter] of syllabus.entries()) {
      const { data: chapterRow, error: chapterError } = await supabase
        .from('chapters')
        .insert({
          course_id: course.id,
          position: chapterIndex + 1,
          title: chapter.title,
          summary: chapter.summary,
        })
        .select('id')
        .single()
      if (chapterError) throw new Error(chapterError.message)

      for (const [nodeIndex, node] of chapter.nodes.entries()) {
        const { data: nodeRow, error: nodeError } = await supabase
          .from('nodes')
          .insert({
            course_id: course.id,
            chapter_id: (chapterRow as { id: string }).id,
            position: nodeIndex + 1,
            title: node.title,
          })
          .select('id')
          .single()
        if (nodeError) throw new Error(nodeError.message)

        const chunk = chunks[node.chunk_index] ?? chunks[0]
        let questions: GeneratedQuestion[] = []
        try {
          questions = validateQuestions(
            parseJsonLoose(
              await chat(
                buildQuestionsPrompt(
                  chapter.title,
                  node.title,
                  chunk,
                  language,
                ),
              ),
            ),
          )
        } catch {
          // A node with no questions is better than failing the whole course.
        }
        if (questions.length > 0) {
          const { error: questionsError } = await supabase
            .from('questions')
            .insert(
              questions.map((question, index) => ({
                course_id: course.id,
                node_id: (nodeRow as { id: string }).id,
                position: index + 1,
                kind: question.kind,
                prompt: question.prompt,
                options: question.options,
                answer: question.answer,
                verified: verifyQuestion(question, chunk),
              })),
            )
          if (questionsError) throw new Error(questionsError.message)
        }
      }
    }

    await supabase
      .from('courses')
      .update({ status: 'ready' })
      .eq('id', course.id)
  } catch (cause) {
    await supabase
      .from('courses')
      .update({
        status: 'failed',
        generation_error: messageOf(cause).slice(0, 500),
      })
      .eq('id', course.id)
  }
}

async function extractMaterialsText(
  supabase: SupabaseClient,
  courseId: string,
): Promise<string> {
  const { data: materials, error } = await supabase
    .from('course_materials')
    .select('file_name, storage_path')
    .eq('course_id', courseId)
    .limit(100)
  if (error) throw new Error(error.message)
  const rows = (materials ?? []) as Array<{
    file_name: string
    storage_path: string
  }>
  if (rows.length === 0) {
    throw new Error('This course has no uploaded materials.')
  }
  const parts: string[] = []
  for (const material of rows) {
    const { data: blob, error: downloadError } = await supabase.storage
      .from('course-materials')
      .download(material.storage_path)
    if (downloadError || !blob) {
      throw new Error(`Could not read ${material.file_name}.`)
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    parts.push(await extractFileText(material.file_name, bytes))
  }
  return parts.join('\n\n')
}

async function extractFileText(
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'txt' || extension === 'md') {
    return new TextDecoder().decode(bytes)
  }
  if (extension === 'pdf') {
    const { text } = await extractText(await getDocumentProxy(bytes), {
      mergePages: true,
    })
    return text
  }
  if (extension === 'docx' || extension === 'pptx') {
    const entries = unzipSync(bytes)
    const keys =
      extension === 'docx'
        ? ['word/document.xml']
        : Object.keys(entries)
            .filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key))
            .sort(
              (a, b) =>
                Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')),
            )
    return keys
      .filter((key) => entries[key])
      .map((key) => extractXmlText(strFromU8(entries[key])))
      .join('\n')
  }
  throw new Error(`Unsupported file type: ${fileName}`)
}

// One call to an OpenAI-compatible chat completions endpoint, with a short
// retry on rate limits — free-tier keys hit 429 routinely.
async function chat(prompt: string): Promise<string> {
  const baseUrl = (
    Deno.env.get('AI_BASE_URL') ??
    'https://generativelanguage.googleapis.com/v1beta/openai'
  ).replace(/\/+$/, '')
  const model = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash'
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${Deno.env.get('AI_API_KEY')}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (response.ok) {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>
      }
      const content = payload.choices?.[0]?.message?.content
      if (typeof content !== 'string' || content === '') {
        throw new Error('The AI returned an empty response.')
      }
      return content
    }
    const detail = (await response.text()).slice(0, 300)
    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)))
      continue
    }
    throw new Error(`AI request failed (${response.status}): ${detail}`)
  }
}
