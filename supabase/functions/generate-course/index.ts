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
import { extractFileText } from '../_shared/extract.ts'
import {
  buildNodeQuestionsPrompt,
  buildNodeRetryPrompt,
  buildSyllabusPrompt,
  buildSystemPrompt,
  chunkText,
  emptyNodeIndexes,
  languageReminder,
  lessonCreditPrize,
  matchesOutputLanguage,
  parseJsonLoose,
  validateChapterQuestions,
  validateSyllabus,
  validateSyllabusQuality,
  verifyQuestion,
} from './pipeline.ts'
import type { GeneratedQuestion } from './pipeline.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_SOURCE_CHARS = 200_000
// A run older than this is considered crashed and may be re-claimed; the
// pipeline budgets its own time well below it so it normally fails cleanly.
const STALE_PROCESSING_MS = 15 * 60 * 1000
const MAX_PIPELINE_MS = 6 * 60 * 1000

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
  // When force=true the caller explicitly wants to replace all existing content
  // (e.g. after uploading new materials to a fully-generated course). Without
  // force, a complete 'ready' course is a no-op to prevent accidental rebuilds.
  const force = (body as { force?: unknown }).force === true

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
  // Exceptions: force=true (owner deliberately rebuilding after new uploads),
  // or a 'ready' course that still has question-less lessons (repair path for
  // runs from before the per-lesson re-ask existed).
  if (course.status === 'ready' && !force) {
    const { data: lessonNodes, error: nodesError } = await supabase
      .from('nodes')
      .select('id, questions(count)')
      .eq('course_id', courseId)
      .limit(500)
    if (nodesError) return json({ error: nodesError.message }, 500)
    const hasEmptyLesson = (
      (lessonNodes ?? []) as Array<{ questions: Array<{ count: number }> }>
    ).some((node) => (node.questions[0]?.count ?? 0) === 0)
    if (!hasEmptyLesson) return json({ status: 'ready' }, 200)
  }
  if (!Deno.env.get('AI_API_KEY')) {
    return json(
      { error: 'AI_API_KEY is not configured (Edge Function secrets).' },
      500,
    )
  }

  // Atomic claim: exactly one invocation flips the course into 'processing'
  // (pending/failed, or a crashed run past the staleness window). Concurrent
  // or spammed invocations get zero rows back and start nothing — no
  // parallel pipelines, no double-billing the key.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS).toISOString()
  // 'ready' is claimable only when this request just saw it ready WITH empty
  // lessons — never lets a race regenerate a course that finished complete.
  const claimable = course.status === 'ready' ? 'pending,failed,ready' : 'pending,failed'
  const { data: claimed, error: claimError } = await supabase
    .from('courses')
    .update({
      status: 'processing',
      generation_error: null,
      generation_started_at: new Date().toISOString(),
    })
    .eq('id', courseId)
    .or(
      `status.in.(${claimable}),and(status.eq.processing,generation_started_at.lt."${staleBefore}")`,
    )
    .select('id')
  if (claimError) return json({ error: claimError.message }, 500)
  if (!claimed || claimed.length === 0) {
    return json({ status: 'processing' }, 202)
  }

  EdgeRuntime.waitUntil(generate(supabase, course))
  return json({ status: 'processing' }, 202)
})

function ensureTime(deadline: number): void {
  if (Date.now() > deadline) {
    throw new Error(
      'Generation timed out — retry, or upload smaller materials.',
    )
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function generate(
  supabase: SupabaseClient,
  course: CourseRow,
): Promise<void> {
  const deadline = Date.now() + MAX_PIPELINE_MS
  try {
    const { error: wipeError } = await supabase
      .from('chapters')
      .delete()
      .eq('course_id', course.id)
    if (wipeError) throw new Error(wipeError.message)

    const text = await extractMaterialsText(supabase, course.id)
    const chunks = chunkText(text.slice(0, MAX_SOURCE_CHARS))
    if (chunks.length === 0) {
      throw new Error(
        'No readable text found in the uploaded materials. Scanned or image-based PDFs have no text layer — re-export them as text-based PDFs (e.g. via Google Docs) and retry.',
      )
    }

    const language = course.output_language
    ensureTime(deadline)
    let syllabus = validateSyllabus(
      parseJsonLoose(await chatInLanguage(buildSyllabusPrompt(chunks, language), language)),
      chunks.length,
    )

    // Quality gates: re-ask once if the syllabus is too thin, skips chunks,
    // or is badly unbalanced.
    const quality = validateSyllabusQuality(syllabus, chunks.length)
    if (!quality.pass) {
      ensureTime(deadline)
      try {
        syllabus = validateSyllabus(
          parseJsonLoose(
            await chatInLanguage(
              buildSyllabusPrompt(chunks, language) + '\n\n' + quality.feedback,
              language,
            ),
          ),
          chunks.length,
        )
      } catch {
        // Accept the first syllabus if the re-ask fails.
      }
    }

    let totalQuestions = 0
    let emptyNodeCount = 0
    let totalNodes = 0
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

      const { data: nodeRows, error: nodesError } = await supabase
        .from('nodes')
        .insert(
          chapter.nodes.map((node, nodeIndex) => ({
            course_id: course.id,
            chapter_id: (chapterRow as { id: string }).id,
            position: nodeIndex + 1,
            title: node.title,
          })),
        )
        .select('id, position')
      if (nodesError) throw new Error(nodesError.message)
      const nodeIds = (nodeRows as Array<{ id: string; position: number }>)
        .sort((a, b) => a.position - b.position)
        .map((row) => row.id)

      const buckets: GeneratedQuestion[][] = chapter.nodes.map(() => [])
      totalNodes += chapter.nodes.length

      // Primary pass: one focused AI call per node.
      for (const [nodeIndex, node] of chapter.nodes.entries()) {
        if (nodeIndex > 0 || chapterIndex > 0) await delay(1500)
        ensureTime(deadline)
        try {
          const result = validateChapterQuestions(
            parseJsonLoose(
              await chatInLanguage(
                buildNodeQuestionsPrompt(node, chunks, language),
                language,
              ),
            ),
            1,
          )
          if (result[0]?.length >= 2) buckets[nodeIndex] = result[0]
        } catch {
          // Node stays empty, will be retried below.
        }
      }

      // Retry pass: one retry per still-empty node with a simpler prompt.
      const missing = emptyNodeIndexes(buckets)
      for (const nodeIndex of missing) {
        await delay(1500)
        ensureTime(deadline)
        try {
          const result = validateChapterQuestions(
            parseJsonLoose(
              await chatInLanguage(
                buildNodeRetryPrompt(chapter.nodes[nodeIndex], chunks, language),
                language,
              ),
            ),
            1,
          )
          if (result[0]?.length) buckets[nodeIndex] = result[0]
        } catch {
          // Node stays empty; tallied below.
        }
      }

      emptyNodeCount += emptyNodeIndexes(buckets).length

      const questionRows = buckets.flatMap((questions, nodeIndex) => {
        const chunk = chunks[chapter.nodes[nodeIndex].chunk_index] ?? chunks[0]
        return questions.map((question, index) => ({
          course_id: course.id,
          node_id: nodeIds[nodeIndex],
          position: index + 1,
          kind: question.kind,
          difficulty: question.difficulty,
          prompt: question.prompt,
          options: question.options,
          answer: question.answer,
          calc: question.calc ?? null,
          verified: verifyQuestion(question, chunk),
        }))
      })
      if (questionRows.length > 0) {
        const { error: questionsError } = await supabase
          .from('questions')
          .insert(questionRows)
        if (questionsError) throw new Error(questionsError.message)
        totalQuestions += questionRows.length
      }

      for (const [nodeIndex, nodeQuestions] of buckets.entries()) {
        const prize = lessonCreditPrize(nodeQuestions)
        if (prize > 0) {
          await supabase
            .from('nodes')
            .update({ credit_prize: prize })
            .eq('id', nodeIds[nodeIndex])
        }
      }
    }

    if (totalNodes > 0 && emptyNodeCount / totalNodes > 0.4) {
      throw new Error(
        `Generation left ${emptyNodeCount}/${totalNodes} lessons without questions — retry, or upload more detailed materials.`,
      )
    }
    if (totalQuestions === 0) {
      throw new Error('The AI did not produce any usable questions.')
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
    .select('file_name, storage_path, extract_status, extract_error, extracted_path')
    .eq('course_id', courseId)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) throw new Error(error.message)
  const rows = (materials ?? []) as Array<{
    file_name: string
    storage_path: string
    extract_status: string
    extract_error: string | null
    extracted_path: string | null
  }>
  if (rows.length === 0) {
    throw new Error('This course has no uploaded materials.')
  }
  // Fail fast (and free) on a material that already failed extraction at
  // upload time, instead of burning AI calls on a course missing its source.
  const broken = rows.find((row) => row.extract_status === 'failed')
  if (broken) {
    throw new Error(
      broken.extract_error ?? `Could not read ${broken.file_name}.`,
    )
  }
  const parts: string[] = []
  let totalChars = 0
  for (const material of rows) {
    // Everything past the source cap gets discarded anyway — stop
    // downloading instead of buffering unused megabytes.
    if (totalChars >= MAX_SOURCE_CHARS) break
    // Prefer the text extracted at upload time; rows from before
    // extraction-at-upload existed ('pending', no extracted_path) fall back
    // to parsing the original file here. The .md path is re-derived from
    // storage_path rather than read from the (owner-writable) extracted_path
    // column, so the column can never point this download anywhere else.
    const extracted =
      material.extract_status === 'ready' && material.extracted_path !== null
    const path = extracted
      ? `${material.storage_path}.md`
      : material.storage_path
    const { data: blob, error: downloadError } = await supabase.storage
      .from('course-materials')
      .download(path)
    if (downloadError || !blob) {
      throw new Error(`Could not read ${material.file_name}.`)
    }
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const part = extracted
      ? new TextDecoder().decode(bytes)
      : await extractFileText(material.file_name, bytes)
    totalChars += part.length
    parts.push(part)
  }
  return parts.join('\n\n')
}

// One model call pinned to the output language by a system message, with a
// single re-ask when the answer detectably drifted to the wrong language
// (the known failure: English questions over Vietnamese materials).
async function chatInLanguage(
  prompt: string,
  outputLanguage: string,
): Promise<string> {
  const system = buildSystemPrompt(outputLanguage)
  const content = await chat(prompt, system)
  if (matchesOutputLanguage(content, outputLanguage)) return content
  return chat(prompt + languageReminder(outputLanguage), system)
}

// One call to an OpenAI-compatible chat completions endpoint, with a short
// retry on rate limits — free-tier keys hit 429 routinely. Each fetch is
// capped at 30 s so a hanging endpoint cannot silently consume the entire
// pipeline budget: it throws, the outer catch in generate() marks the course
// 'failed', and the user gets a retryable error instead of a stalled spinner.
async function chat(prompt: string, system: string): Promise<string> {
  const baseUrl = (
    Deno.env.get('AI_BASE_URL') ??
    'https://generativelanguage.googleapis.com/v1beta/openai'
  ).replace(/\/+$/, '')
  const model = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash'
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)
    let response: Response
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        signal: controller.signal,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('AI_API_KEY')}`,
        },
        body: JSON.stringify({
          model,
          // Low temperature + JSON mode + a hard output cap: the pipeline wants
          // consistent, schema-shaped output at a bounded per-call cost, not
          // creative variance. 16 384 gives comfortable headroom for chapters
          // with verbose questions or non-Latin scripts.
          temperature: 0.2,
          response_format: { type: 'json_object' },
          max_tokens: 16_384,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      })
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          'AI request timed out after 30 s — retry, or upload smaller materials.',
          { cause: err },
        )
      }
      throw err
    }
    clearTimeout(timer)
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
