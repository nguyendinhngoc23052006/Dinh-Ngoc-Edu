// generate-course: the AI pipeline that turns a course's uploaded materials
// into chapters -> nodes -> questions, then flips the course to ready/failed.
//
// It runs with the CALLER's JWT (no service-role key): the existing RLS owner
// policies authorize every read and write, so the function cannot touch a
// course its caller does not own. The heavy work runs in the background via
// EdgeRuntime.waitUntil; the client gets a 202 and polls course.status.
//
// Secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   AI_API_KEY   required — Gemini API key
//   AI_BASE_URL  optional — default https://generativelanguage.googleapis.com/v1beta
//   AI_MODEL     optional — default gemini-2.5-flash
//
// Uses Gemini's native generateContent API (not the OpenAI-compat wrapper)
// so we can control thinking_budget per call and use native responseSchema.
// Thinking and max-output tokens are right-sized per call type to cut cost
// without hurting quality.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { extractFileText } from '../_shared/extract.ts'
import {
  buildBatchQuestionsPrompt,
  buildDeltaRetryPrompt,
  buildQuestionsSchema,
  buildSyllabusPrompt,
  buildSystemPrompt,
  chunkText,
  languageReminder,
  lessonCreditPrize,
  matchesOutputLanguage,
  MIN_QUESTIONS_PER_NODE,
  parseJsonLoose,
  validateChapterQuestions,
  validateSyllabus,
  validateSyllabusQuality,
  verifyQuestion,
  SYLLABUS_SCHEMA,
} from './pipeline.ts'
import type { GeneratedQuestion, SyllabusChapter } from './pipeline.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_SOURCE_CHARS = 200_000
// A run older than this is considered crashed and may be re-claimed; the
// pipeline budgets its own time well below it so it normally fails cleanly.
const STALE_PROCESSING_MS = 15 * 60 * 1000
// Chapters run in parallel (paid-tier RPM, 150-300 RPM Tier 1, easily
// absorbs 8 concurrent primary calls). Wall-clock is gated by the slowest
// single chapter's primary + its delta retries (~60-90 s typical), not by
// the chapter count. 10 min keeps headroom for a worst-case slow chapter
// while staying well under the 15-min stale reclaim window.
const MAX_PIPELINE_MS = 10 * 60 * 1000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface ChatOptions {
  thinkingBudget: number
  maxOutputTokens: number
  jsonSchema?: Record<string, unknown>
  // Per-call request timeout. A batched question call with 4096-thinking +
  // 16K-output routinely takes >30s, so callers bump this above the default.
  timeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
// Headroom for batched question calls and retries: 4 nodes × 6 questions with
// rationales + 4096 thinking tokens can take 40-50 s end-to-end.
const QUESTION_REQUEST_TIMEOUT_MS = 60_000

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
      parseJsonLoose(await chatInLanguage(buildSyllabusPrompt(chunks, language), language, {
        thinkingBudget: 512, maxOutputTokens: 4096, jsonSchema: SYLLABUS_SCHEMA,
      })),
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
              { thinkingBudget: 512, maxOutputTokens: 4096, jsonSchema: SYLLABUS_SCHEMA },
            ),
          ),
          chunks.length,
        )
      } catch {
        // Accept the first syllabus if the re-ask fails.
      }
    }

    // Chapters run in parallel — paid-tier RPM (Tier 1: 150-300 RPM on
    // 2.5 Flash) absorbs ≤8 concurrent primary calls easily, and the slow
    // path is each chapter's primary + delta retries sequence, not the
    // chapter count. A failure in one chapter's task never poisons another's
    // writes (each task owns its chapter insert).
    const chapterResults = await Promise.all(
      syllabus.map((chapter, chapterIndex) =>
        generateChapter(
          supabase,
          course.id,
          chapter,
          chapterIndex,
          chunks,
          language,
          deadline,
        ),
      ),
    )
    const totalQuestions = chapterResults.reduce(
      (sum, r) => sum + r.questionsWritten,
      0,
    )

    if (totalQuestions === 0) {
      throw new Error('The AI did not produce any usable questions.')
    }

    // Partial completion no longer fails the course. The CoursePage banner
    // (existing question_count === 0 check) surfaces empty lessons with a
    // one-tap "fill" button; a paying user gets the lessons that worked
    // instead of the whole run being thrown away.
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

// One chapter, end-to-end: insert chapter row + node rows, ask the model for
// every lesson's questions in a single primary call, top up any short nodes
// with a delta retry that lists what's already there, then insert questions
// and update each node's credit prize. Returns the chapter's totals so the
// outer pipeline can sum across parallel chapter tasks.
async function generateChapter(
  supabase: SupabaseClient,
  courseId: string,
  chapter: SyllabusChapter,
  chapterIndex: number,
  chunks: string[],
  language: string,
  deadline: number,
): Promise<{ questionsWritten: number }> {
  const { data: chapterRow, error: chapterError } = await supabase
    .from('chapters')
    .insert({
      course_id: courseId,
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
        course_id: courseId,
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

  // Primary: one batch for the whole chapter (NODES_PER_BATCH = MAX_NODES_PER_CHAPTER).
  // SOFT-KEEP: whatever the model returned for each node is kept as-is, even
  // if below MIN_QUESTIONS_PER_NODE. The delta retry below tops up short
  // nodes without throwing existing questions away — a 5/10 result becomes
  // 5 + retry, not 0 then retry-might-be-0.
  ensureTime(deadline)
  try {
    const result = validateChapterQuestions(
      parseJsonLoose(
        await chatInLanguage(
          buildBatchQuestionsPrompt(chapter.nodes, chunks, language),
          language,
          {
            thinkingBudget: 1024,
            maxOutputTokens: 24576,
            jsonSchema: buildQuestionsSchema(chapter.nodes.length),
            timeoutMs: QUESTION_REQUEST_TIMEOUT_MS,
          },
        ),
      ),
      chapter.nodes.length,
    )
    for (let i = 0; i < chapter.nodes.length; i += 1) {
      buckets[i] = result[i] ?? []
    }
  } catch {
    // Primary failed — every node stays empty; delta retries below try to
    // fill each one with a needed-count of MIN_QUESTIONS_PER_NODE.
  }

  // Delta retry: only the nodes below MIN, only for the missing count.
  // Existing questions are listed in the prompt so the model can't duplicate
  // them; calc IS allowed (a short primary often means the model ran low
  // on tokens, not that the source has no formula).
  for (let i = 0; i < chapter.nodes.length; i += 1) {
    const have = buckets[i].length
    if (have >= MIN_QUESTIONS_PER_NODE) continue
    const needed = MIN_QUESTIONS_PER_NODE - have
    ensureTime(deadline)
    try {
      const result = validateChapterQuestions(
        parseJsonLoose(
          await chatInLanguage(
            buildDeltaRetryPrompt(
              chapter.nodes[i],
              buckets[i],
              needed,
              chunks,
              language,
            ),
            language,
            {
              thinkingBudget: 512,
              maxOutputTokens: 12288,
              jsonSchema: buildQuestionsSchema(1, { minItems: needed }),
              timeoutMs: QUESTION_REQUEST_TIMEOUT_MS,
            },
          ),
        ),
        1,
      )
      if (result[0]?.length) {
        buckets[i] = buckets[i].concat(result[0])
      }
    } catch {
      // Stays partial; the CoursePage banner surfaces it for a one-tap fill.
    }
  }

  const questionRows = buckets.flatMap((questions, nodeIndex) => {
    const chunk = chunks[chapter.nodes[nodeIndex].chunk_index] ?? chunks[0]
    return questions.map((question, index) => ({
      course_id: courseId,
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
  let questionsWritten = 0
  if (questionRows.length > 0) {
    const { error: questionsError } = await supabase
      .from('questions')
      .insert(questionRows)
    if (questionsError) throw new Error(questionsError.message)
    questionsWritten = questionRows.length
  }

  for (const [nodeIndex, nodeQuestions] of buckets.entries()) {
    const prize = lessonCreditPrize(nodeQuestions)
    if (prize > 0) {
      const { error: prizeError } = await supabase
        .from('nodes')
        .update({ credit_prize: prize })
        .eq('id', nodeIds[nodeIndex])
      if (prizeError) throw new Error(prizeError.message)
    }
  }

  return { questionsWritten }
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

async function chatInLanguage(
  prompt: string,
  outputLanguage: string,
  opts: ChatOptions,
): Promise<string> {
  const system = buildSystemPrompt(outputLanguage)
  const content = await chat(prompt, system, opts)
  if (matchesOutputLanguage(content, outputLanguage)) return content
  return chat(prompt + languageReminder(outputLanguage), system, opts)
}

async function chat(
  prompt: string,
  system: string,
  opts: ChatOptions,
): Promise<string> {
  const apiKey = Deno.env.get('AI_API_KEY')
  const baseUrl = (
    Deno.env.get('AI_BASE_URL') ??
    'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '')
  const model = Deno.env.get('AI_MODEL') ?? 'gemini-2.5-flash'

  const generationConfig: Record<string, unknown> = {
    temperature: 0.2,
    maxOutputTokens: opts.maxOutputTokens,
    responseMimeType: 'application/json',
    thinkingConfig: { thinkingBudget: opts.thinkingBudget },
  }
  if (opts.jsonSchema) {
    generationConfig.responseSchema = opts.jsonSchema
  }

  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  for (let attempt = 0; ; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      response = await fetch(
        `${baseUrl}/models/${model}:generateContent`,
        {
          signal: controller.signal,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey ?? '',
          },
          body: JSON.stringify(body),
        },
      )
    } catch (err) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `AI request timed out after ${Math.round(timeoutMs / 1000)} s — retry, or upload smaller materials.`,
          { cause: err },
        )
      }
      throw err
    }
    clearTimeout(timer)
    if (response.ok) {
      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string; thought?: boolean }> }
        }>
      }
      const parts = payload.candidates?.[0]?.content?.parts
      const text = parts
        ?.filter((p) => typeof p.text === 'string' && !p.thought)
        ?.map((p) => p.text)
        ?.join('') ?? ''
      if (text === '') {
        throw new Error('The AI returned an empty response.')
      }
      return text
    }
    const detail = (await response.text()).slice(0, 300)
    if (attempt < 2 && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)))
      continue
    }
    throw new Error(`AI request failed (${response.status}): ${detail}`)
  }
}
