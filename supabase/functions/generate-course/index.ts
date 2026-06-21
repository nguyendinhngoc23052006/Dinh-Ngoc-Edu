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
  buildNodeQuestionsPrompt,
  buildSyllabusPrompt,
  buildSystemPrompt,
  chunkText,
  languageReminder,
  lessonCreditPrize,
  matchesOutputLanguage,
  MIN_QUESTIONS_PER_NODE,
  NODE_QUESTIONS_SCHEMA,
  parseJsonLoose,
  QUESTIONS_PER_NODE,
  SYLLABUS_SCHEMA,
  validateNodeQuestions,
  validateSyllabus,
  validateSyllabusQuality,
  verifyQuestion,
} from './pipeline.ts'
import type { GeneratedQuestion, SyllabusChapter, SyllabusNode } from './pipeline.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MAX_SOURCE_CHARS = 200_000
// A run older than this is considered crashed and may be re-claimed; the
// pipeline budgets its own time well below it so it normally fails cleanly.
const STALE_PROCESSING_MS = 15 * 60 * 1000
// Chapters run in parallel; lessons within a chapter run sequentially. Worst
// case: 5 lessons × (35 s initial + 35 s retry) ≈ 6 min per chapter, plus
// syllabus ≈ 30 s, leaving ~3 min headroom for 429 backoffs (5 s + 10 s per
// chat call). Per-lesson budget check skips the retry — or skips the
// remaining lessons entirely — when this runs out, so the run always lands
// in `ready` or `failed` before the staleness window above kicks in.
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
  timeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
// Per-lesson question calls ask for 6 questions max with a small schema;
// 35 s is enough headroom for thinking + JSON emission on Flash 2.5 while
// keeping 2× timeout under the per-chapter share of the pipeline budget.
const QUESTION_REQUEST_TIMEOUT_MS = 35_000

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
  // or a 'ready' course that still has question-less lessons (repair path).
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

    // Chapters run in parallel; each chapter's nodes run sequentially inside.
    // A throw in one chapter's task is caught here (its lessons report as
    // failed but the other chapters' results are preserved), so a single
    // chapter's DB or LLM error never wipes the run.
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
        ).catch((err) => ({
          questionsWritten: 0,
          lessonErrors: [`Chapter "${chapter.title}" failed: ${messageOf(err)}`],
        })),
      ),
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
      // Fresh AI generation never produces calc; existing calc rows on cloned
      // or seeded courses are untouched and the UI keeps rendering them.
      calc: null,
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
        thinkingBudget: 768,
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
          thinkingBudget: 512,
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
