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
//
// SHAPE: one Gemini call PER LESSON, not per chapter batch. The previous
// batch shape asked for 50 questions in one call with a responseSchema
// minItems floor; Gemini 2.5 Flash silently truncates or empties the response
// when it can't satisfy that floor, which produced "22 lessons, 1 question"
// runs and the "did not produce any usable questions" total-failure throw.
// Per-lesson calls are small enough to land reliably; chapters still run in
// parallel and lessons within a chapter run sequentially so the chapter's
// stable-prefix prompt benefits from Gemini's implicit cache.

import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { extractFileText } from '../_shared/extract.ts'
import {
  buildCalcQuestionsPrompt,
  buildNodeQuestionsPrompt,
  buildSyllabusPrompt,
  buildSystemPrompt,
  CALC_QUESTIONS_SCHEMA,
  chunkText,
  detectFormulas,
  languageReminder,
  lessonCreditPrize,
  matchesOutputLanguage,
  MIN_QUESTIONS_PER_NODE,
  NODE_QUESTIONS_SCHEMA,
  parseJsonLoose,
  QUESTIONS_PER_NODE,
  SYLLABUS_SCHEMA,
  validateNodeCalcQuestions,
  validateNodeQuestions,
  validateSyllabus,
  validateSyllabusQuality,
  verifyQuestion,
} from './pipeline.ts'
import type { GeneratedQuestion, SyllabusChapter, SyllabusNode } from './pipeline.ts'

const CALC_QUESTIONS_PER_NODE = 2
// Smaller ask + richer schema = ~40 s end-to-end on Flash 2.5 on a slow day.
const CALC_FOLLOWUP_TIMEOUT_MS = 40_000
// Budget gate: skip the calc follow-up if less than this much time is left in
// the pipeline deadline. Sized to cover one calc call + a 5 s 429 backoff.
const CALC_FOLLOWUP_HEADROOM_MS = 50_000

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_SOURCE_CHARS = 200_000
// A run older than this is considered crashed and may be re-claimed; the
// pipeline budgets its own time well below it so it normally fails cleanly.
const STALE_PROCESSING_MS = 15 * 60 * 1000
// Chapters run in parallel; lessons within a chapter run sequentially. Worst
// case for a math-heavy chapter: 5 lessons × (55 s main + 55 s retry + 40 s
// calc follow-up) ≈ 12.5 min per chapter, plus syllabus ≈ 50 s. The per-lesson
// budget check skips the retry — and `CALC_FOLLOWUP_HEADROOM_MS` skips the
// calc call — when this runs out, so the run always lands in `ready` or
// `failed` before the 15-min staleness window above kicks in.
const MAX_PIPELINE_MS = 12 * 60 * 1000
// Chapters run four-at-a-time rather than all-at-once to avoid the burst
// that causes 429 rate-limit hits.
const CHAPTER_CONCURRENCY = 4

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

interface ChatOptions {
  thinkingBudget: number
  maxOutputTokens: number
  jsonSchema?: Record<string, unknown>
  timeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 50_000
// Per-lesson question calls ask for 8 questions max with a small schema;
// 55 s gives Gemini 2.5 Flash enough headroom on slow days while staying
// well within the pipeline budget even across retries.
const QUESTION_REQUEST_TIMEOUT_MS = 55_000

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
  // or a 'ready' course with under-filled lessons (targeted repair path).
  let needsFill = false
  if (course.status === 'ready' && !force) {
    const { data: lessonNodes, error: nodesError } = await supabase
      .from('nodes')
      .select('id, questions(count)')
      .eq('course_id', courseId)
      .limit(500)
    if (nodesError) return json({ error: nodesError.message }, 500)
    const hasUnderfilledLesson = (
      (lessonNodes ?? []) as Array<{ questions: Array<{ count: number }> }>
    ).some((node) => (node.questions[0]?.count ?? 0) < MIN_QUESTIONS_PER_NODE)
    if (!hasUnderfilledLesson) return json({ status: 'ready' }, 200)
    needsFill = true
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

  EdgeRuntime.waitUntil(
    needsFill ? fillMissingQuestions(supabase, course) : generate(supabase, course),
  )
  return json({ status: 'processing' }, 202)
})

async function mapConcurrent<T, U>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<U>,
): Promise<U[]> {
  const results: U[] = new Array(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function ensureTime(deadline: number): void {
  if (Date.now() > deadline) {
    throw new Error(
      'Generation timed out — retry, or upload smaller materials.',
    )
  }
}

// Targeted repair: re-generate only the lessons that are still below the
// minimum question threshold, leaving every other lesson and its progress
// untouched. Called when a 'ready' course has under-filled lessons so the
// owner can top them up without nuking the entire course.
async function fillMissingQuestions(
  supabase: SupabaseClient,
  course: CourseRow,
): Promise<void> {
  const deadline = Date.now() + MAX_PIPELINE_MS
  try {
    const text = await extractMaterialsText(supabase, course.id)
    const chunks = chunkText(text.slice(0, MAX_SOURCE_CHARS))
    const language = course.output_language

    type NodeWithCount = { id: string; title: string; chunk_index: number; questions: Array<{ count: number }> }
    const { data: allNodes, error: nodesError } = await supabase
      .from('nodes')
      .select('id, title, chunk_index, questions(count)')
      .eq('course_id', course.id)
      .limit(500)
    if (nodesError) throw new Error(nodesError.message)

    const underfilled = ((allNodes ?? []) as NodeWithCount[]).filter(
      (n) => (n.questions[0]?.count ?? 0) < MIN_QUESTIONS_PER_NODE,
    )

    if (underfilled.length === 0) {
      await supabase.from('courses').update({ status: 'ready', generation_error: null }).eq('id', course.id)
      return
    }

    const lessonErrors: string[] = []

    await mapConcurrent(underfilled, CHAPTER_CONCURRENCY, async (nodeRow) => {
      if (Date.now() > deadline) {
        lessonErrors.push(`"${nodeRow.title}": skipped (pipeline budget exhausted)`)
        return
      }
      // Delete existing (potentially malformed) questions for this node first.
      const { error: delError } = await supabase
        .from('questions')
        .delete()
        .eq('node_id', nodeRow.id)
      if (delError) {
        lessonErrors.push(`"${nodeRow.title}": ${delError.message}`)
        return
      }

      const syntheticNode: SyllabusNode = {
        title: nodeRow.title,
        summary: '',
        chunk_index: nodeRow.chunk_index,
      }
      const { questions, error } = await generateLessonQuestions(syntheticNode, chunks, language, deadline)
      if (questions.length === 0) {
        if (error) lessonErrors.push(`"${nodeRow.title}": ${error}`)
        return
      }
      const chunk = chunks[nodeRow.chunk_index] ?? chunks[0]
      const questionRows = questions.map((q, index) => ({
        course_id: course.id,
        node_id: nodeRow.id,
        position: index + 1,
        kind: q.kind,
        difficulty: q.difficulty,
        prompt: q.prompt,
        options: q.options,
        answer: q.answer,
        calc: q.calc ?? null,
        verified: verifyQuestion(q, chunk),
      }))
      const { error: insertError } = await supabase.from('questions').insert(questionRows)
      if (insertError) {
        lessonErrors.push(`"${nodeRow.title}": ${insertError.message}`)
        return
      }
      const prize = lessonCreditPrize(questions)
      if (prize > 0) {
        await supabase.from('nodes').update({ credit_prize: prize }).eq('id', nodeRow.id)
      }
    })

    const generationNote = lessonErrors.length === 0
      ? null
      : `${lessonErrors.length} lesson(s) still need a retry — ${lessonErrors.slice(0, 2).join('; ')}${lessonErrors.length > 2 ? '...' : ''}`.slice(0, 500)
    await supabase
      .from('courses')
      .update({ status: 'ready', generation_error: generationNote })
      .eq('id', course.id)
  } catch (cause) {
    await supabase
      .from('courses')
      .update({ status: 'failed', generation_error: messageOf(cause).slice(0, 500) })
      .eq('id', course.id)
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
        thinkingBudget: 1024, maxOutputTokens: 4096, jsonSchema: SYLLABUS_SCHEMA,
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
              { thinkingBudget: 0, maxOutputTokens: 4096, jsonSchema: SYLLABUS_SCHEMA },
            ),
          ),
          chunks.length,
        )
      } catch {
        // Accept the first syllabus if the re-ask fails.
      }
    }

    // Chapters run with bounded concurrency; lessons within a chapter run
    // sequentially. Full Promise.all caused a burst that hit rate limits,
    // producing 5 s/10 s waits and 0-question lessons from AbortError timeouts.
    const chapterResults = await mapConcurrent(
      syllabus,
      CHAPTER_CONCURRENCY,
      (chapter, chapterIndex) =>
        generateChapter(
          supabase,
          course.id,
          chapter,
          chapterIndex,
          chunks,
          language,
          deadline,
        ).catch((err) => ({
          questionsWritten: 0,
          lessonErrors: [`Chapter "${chapter.title}" failed: ${messageOf(err)}`],
        })),
    )
    const totalQuestions = chapterResults.reduce(
      (sum, r) => sum + r.questionsWritten,
      0,
    )
    const lessonErrors = chapterResults.flatMap((r) => r.lessonErrors)

    if (totalQuestions === 0) {
      throw new Error(
        lessonErrors.length > 0
          ? `Generation produced no questions. First failure: ${lessonErrors[0]}`
          : 'The AI did not produce any usable questions.',
      )
    }

    // Partial completion stays 'ready' but records WHICH lessons came back
    // empty, so the owner can see in the CoursePage banner why some lessons
    // need a fill — and the next "Fill empty lessons" tap can land cleanly.
    const generationNote = lessonErrors.length === 0
      ? null
      : `${lessonErrors.length} lesson(s) need a retry — ${lessonErrors.slice(0, 2).join('; ')}${lessonErrors.length > 2 ? '...' : ''}`.slice(0, 500)
    await supabase
      .from('courses')
      .update({ status: 'ready', generation_error: generationNote })
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

interface ChapterResult {
  questionsWritten: number
  lessonErrors: string[]
}

// One chapter, end-to-end: insert chapter row + node rows, generate questions
// for each lesson sequentially (so Gemini's implicit cache reuses the chapter
// source across lessons), insert questions, set each lesson's credit prize.
// Lessons that fail are recorded but do not throw — the chapter still inserts
// every successful lesson's questions.
async function generateChapter(
  supabase: SupabaseClient,
  courseId: string,
  chapter: SyllabusChapter,
  chapterIndex: number,
  chunks: string[],
  language: string,
  deadline: number,
): Promise<ChapterResult> {
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

  const lessonErrors: string[] = []
  const nodeQuestions: GeneratedQuestion[][] = []

  for (let i = 0; i < chapter.nodes.length; i += 1) {
    const node = chapter.nodes[i]
    // Budget check is non-throwing here so the chapter still inserts every
    // lesson it DID finish — a throw out of the loop wipes that work and
    // leaves the chapter row orphaned.
    if (Date.now() > deadline) {
      for (let j = i; j < chapter.nodes.length; j += 1) {
        nodeQuestions.push([])
        lessonErrors.push(
          `"${chapter.nodes[j].title}": skipped (pipeline budget exhausted)`,
        )
      }
      break
    }
    const { questions, error } = await generateLessonQuestions(
      node,
      chunks,
      language,
      deadline,
    )
    nodeQuestions.push(questions)
    if (questions.length === 0 && error) {
      lessonErrors.push(`"${node.title}": ${error}`)
    }
  }

  const questionRows = nodeQuestions.flatMap((questions, nodeIndex) => {
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
      // Populated by the calc follow-up call; null for mcq/mcq_multi/fill_blank.
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

  for (const [nodeIndex, questions] of nodeQuestions.entries()) {
    const prize = lessonCreditPrize(questions)
    if (prize > 0) {
      const { error: prizeError } = await supabase
        .from('nodes')
        .update({ credit_prize: prize })
        .eq('id', nodeIds[nodeIndex])
      if (prizeError) throw new Error(prizeError.message)
    }
  }

  return { questionsWritten, lessonErrors }
}

interface LessonGenerationResult {
  questions: GeneratedQuestion[]
  error: string | null
}

// One lesson, end-to-end: initial call asking for QUESTIONS_PER_NODE, then
// ONE retry asking for the missing count if the initial came back below
// MIN_QUESTIONS_PER_NODE. Both calls share the same simple per-lesson schema
// (no minItems, no node_index, no calc — those were the silent killers in
// the previous batch shape). Errors are captured and returned, never thrown
// out, so one bad lesson never sinks the whole chapter. The deadline is
// re-checked between the initial and retry calls so a near-deadline lesson
// keeps whatever the initial returned instead of busting the budget.
async function generateLessonQuestions(
  node: SyllabusNode,
  chunks: string[],
  language: string,
  deadline: number,
): Promise<LessonGenerationResult> {
  let questions: GeneratedQuestion[] = []
  let firstError: string | null = null

  try {
    const raw = await chatInLanguage(
      buildNodeQuestionsPrompt(node, [], QUESTIONS_PER_NODE, chunks, language),
      language,
      {
        thinkingBudget: 1024,
        maxOutputTokens: 4096,
        jsonSchema: NODE_QUESTIONS_SCHEMA,
        timeoutMs: QUESTION_REQUEST_TIMEOUT_MS,
      },
    )
    questions = validateNodeQuestions(parseJsonLoose(raw))
  } catch (err) {
    firstError = messageOf(err)
  }

  // Skip the retry if the initial already burned past the deadline — better
  // to ship a short lesson than to extend the run past the staleness window.
  if (questions.length < MIN_QUESTIONS_PER_NODE && Date.now() < deadline) {
    const needed = MIN_QUESTIONS_PER_NODE - questions.length
    try {
      const raw = await chatInLanguage(
        buildNodeQuestionsPrompt(node, questions, needed, chunks, language),
        language,
        {
          thinkingBudget: 0,
          maxOutputTokens: 3072,
          jsonSchema: NODE_QUESTIONS_SCHEMA,
          timeoutMs: QUESTION_REQUEST_TIMEOUT_MS,
        },
      )
      const more = validateNodeQuestions(parseJsonLoose(raw))
      if (more.length > 0) questions = questions.concat(more)
    } catch (err) {
      if (firstError === null) firstError = messageOf(err)
    }
  }

  // Calc follow-up: gated by (1) source-text formula detection so all-text
  // courses pay nothing extra, and (2) deadline headroom so a near-budget
  // lesson never triggers an extra call that pushes the pipeline past the
  // 10-min cap. Failure here is silent on purpose — the lesson already has
  // its mcq/fill_blank questions, calc is additive, never a regression.
  const lessonSource = chunks[node.chunk_index] ?? ''
  if (
    detectFormulas(lessonSource) &&
    Date.now() + CALC_FOLLOWUP_HEADROOM_MS < deadline
  ) {
    try {
      const raw = await chatInLanguage(
        buildCalcQuestionsPrompt(node, CALC_QUESTIONS_PER_NODE, chunks, language),
        language,
        {
          thinkingBudget: 0,
          maxOutputTokens: 4096,
          jsonSchema: CALC_QUESTIONS_SCHEMA,
          timeoutMs: CALC_FOLLOWUP_TIMEOUT_MS,
        },
      )
      const calcs = validateNodeCalcQuestions(parseJsonLoose(raw))
      if (calcs.length > 0) questions = questions.concat(calcs)
    } catch {
      // Calc is bonus content — a failure leaves the mcq/fill_blank intact.
    }
  }

  return {
    questions,
    error: questions.length === 0 ? firstError ?? 'no usable questions returned' : null,
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
    if (totalChars >= MAX_SOURCE_CHARS) break
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
  return chat(prompt + languageReminder(outputLanguage), system, { ...opts, thinkingBudget: 0 })
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
