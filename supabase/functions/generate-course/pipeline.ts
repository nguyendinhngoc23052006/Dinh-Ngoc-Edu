// Pure helpers for the generate-course pipeline: chunking, prompt building,
// JSON parsing, format enforcement, and answer verification. No Deno or
// network imports, so the sandbox unit tests (vitest) exercise them directly.

export const MAX_CHAPTERS = 10
export const MAX_NODES_PER_CHAPTER = 5
// Target questions per lesson. Small enough that a single Gemini call
// reliably produces them without tripping structured-output truncation —
// the previous chapter-batch shape asked for 50 questions in one call and
// failed silently when Gemini couldn't satisfy responseSchema.minItems.
export const QUESTIONS_PER_NODE = 8
// Acceptance floor: a lesson with fewer than this many usable questions
// after the first call gets ONE focused retry for the missing count.
export const MIN_QUESTIONS_PER_NODE = 5
const MAX_QUESTIONS_PER_NODE = 10
const MAX_OPTIONS = 6

export interface SyllabusNode {
  title: string
  chunk_index: number
}

export interface SyllabusChapter {
  title: string
  summary: string
  nodes: SyllabusNode[]
}

import { validateCalcSpec } from '../_shared/calc.ts'
import type { CalcSpec } from '../_shared/calc.ts'

export type Difficulty = 'easy' | 'medium' | 'hard'

// The four kinds the AI generates. `mcq`, `mcq_multi`, `fill_blank` come from
// the main per-lesson call; `calc` comes from a separate dedicated follow-up
// call fired only on lessons whose source text contains formulas (see
// `detectFormulas`). The calc path has its own schema + few-shot library
// (`CALC_QUESTIONS_SCHEMA`, `buildCalcQuestionsPrompt`) so the main per-lesson
// schema stays minimal and reliable, and a failed calc call leaves the
// lesson's mcq/fill_blank questions untouched.
export interface GeneratedQuestion {
  kind: 'mcq' | 'mcq_multi' | 'fill_blank' | 'calc'
  difficulty: Difficulty
  prompt: string
  options: string[]
  answer: { correct_indexes?: number[]; accepted?: string[] }
  calc?: CalcSpec
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
function toDifficulty(value: unknown): Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as Difficulty)
    : 'medium'
}

// A lesson's credit prize is the sum of its questions' difficulty weights —
// the AI's per-question difficulty calls roll up into how much a flawless run
// is worth, so harder lessons pay more.
const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }
export function lessonCreditPrize(questions: GeneratedQuestion[]): number {
  return questions.reduce((sum, q) => sum + DIFFICULTY_WEIGHT[q.difficulty], 0)
}

// Removes structural boilerplate that survives PDF/DOCX/PPTX text extraction —
// page numbers, running headers/footers, TOC entries, copyright notices,
// download-platform attribution, bare emails, URL-only lines. Two-pass:
// pass 1 identifies lines that repeat 3+ times (running header/footer pattern);
// pass 2 strips those plus pattern-matched lines. Idempotent — safe to call on
// already-clean text.
export function stripBoilerplate(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n')

  // Pass 1 — running headers/footers repeat once per page; real content doesn't.
  const freq = new Map<string, number>()
  for (const line of lines) {
    const key = line.trim()
    if (key) freq.set(key, (freq.get(key) ?? 0) + 1)
  }
  const repeated = new Set(
    [...freq.entries()].filter(([, n]) => n >= 3).map(([line]) => line),
  )

  // Pass 2 — structural patterns that signal non-educational content.
  const filtered = lines.filter((line) => {
    const t = line.trim()
    if (!t) return true // preserve blank lines; collapse runs below
    if (repeated.has(t)) return false
    // Standalone page numbers: "42", "- 42 -", "Page 5 of 10"
    if (/^[-–—\s]*(?:page\s+)?\d+[-–—\s]*(?:of\s+\d+)?\s*$/i.test(t)) return false
    // TOC entries: "Chapter 3 ......... 45"
    if (/\.{3,}\s*\d+\s*$/.test(t)) return false
    // Copyright / legal boilerplate
    if (/©|all rights reserved|no part of this publication|may not be reproduced/i.test(t)) return false
    // Download / upload attribution (any platform)
    if (/\b(downloaded|uploaded|shared)\s+by\b/i.test(t)) return false
    // Document-sharing platform names
    if (/\b(studocu|coursehero|scribd|academia\.edu|researchgate)\b/i.test(t)) return false
    // ISBN / publication metadata
    if (/\bISBN[-\s]?\d|first published|published\s+by\b/i.test(t)) return false
    // Watermark-only lines
    if (/^(draft|confidential|sample|copy|preview)\s*$/i.test(t)) return false
    // Bare email address (the entire line is an email)
    if (/^[^\s@]+@[^\s@]+\.[^\s]{2,}$/.test(t)) return false
    // URL-dominant short lines (URL > 60% of line, line < 120 chars)
    const urlMatch = t.match(/https?:\/\/\S+|www\.[^\s]+/i)
    if (urlMatch && t.length < 120 && urlMatch[0].length / t.length > 0.6) return false
    return true
  })

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Rejects chunks that are too thin to generate 4–6 grounded questions from.
// Word count < 30 catches metadata remnants that survived stripping; diversity
// < 0.35 (unique/total words) catches boilerplate that repeats the same terms
// (URL lists, repeated headers) — academic prose has naturally higher diversity.
export function isEducationalChunk(chunk: string): boolean {
  const words = chunk.trim().split(/\s+/).filter(Boolean)
  if (words.length < 30) return false
  const unique = new Set(words.map((w) => w.toLowerCase()))
  return unique.size / words.length >= 0.35
}

// Each node carries a chunk_index from the syllabus step so the question step
// can send back only that chunk — that's how a long upload fits a small model.
export function chunkText(
  text: string,
  maxChars = 4000,
  maxChunks = 50,
): string[] {
  const clean = stripBoilerplate(text)
  if (!clean) return []
  const chunks: string[] = []
  let current = ''
  for (const paragraph of clean.split(/\n{2,}/)) {
    const part = paragraph.trim()
    if (!part) continue
    if (part.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < part.length; i += maxChars) {
        chunks.push(part.slice(i, i + maxChars))
      }
      continue
    }
    if (current.length + part.length + 2 > maxChars) {
      chunks.push(current)
      current = part
    } else {
      current = current ? `${current}\n\n${part}` : part
    }
  }
  if (current) chunks.push(current)
  // Filter before slicing so boilerplate chunks don't consume coverage slots.
  return chunks.filter(isEducationalChunk).slice(0, maxChunks)
}

// Models occasionally wrap JSON in prose or code fences despite the
// responseMimeType setting — slice from the first `{`/`[` to the last
// `}`/`]` so a stray prefix or suffix doesn't fail the parse.
export function parseJsonLoose(raw: string): unknown {
  const start = raw.search(/[[{]/)
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  if (start === -1 || end <= start) {
    throw new Error('The AI returned no JSON.')
  }
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('The AI returned invalid JSON.')
  }
}

export function validateSyllabus(
  value: unknown,
  chunkCount: number,
): SyllabusChapter[] {
  const root =
    value && typeof value === 'object' && 'chapters' in value
      ? (value as { chapters: unknown }).chapters
      : value
  if (!Array.isArray(root)) {
    throw new Error('The syllabus must be a list of chapters.')
  }
  const chapters: SyllabusChapter[] = []
  for (const entry of root.slice(0, MAX_CHAPTERS)) {
    if (!entry || typeof entry !== 'object') continue
    const chapter = entry as Record<string, unknown>
    const title = typeof chapter.title === 'string' ? chapter.title.trim() : ''
    if (!title) continue
    const summary =
      typeof chapter.summary === 'string' ? chapter.summary.trim() : ''
    const nodes: SyllabusNode[] = []
    const rawNodes = Array.isArray(chapter.nodes) ? chapter.nodes : []
    for (const rawNode of rawNodes.slice(0, MAX_NODES_PER_CHAPTER)) {
      if (!rawNode || typeof rawNode !== 'object') continue
      const node = rawNode as Record<string, unknown>
      const nodeTitle = typeof node.title === 'string' ? node.title.trim() : ''
      if (!nodeTitle) continue
      const rawIndex =
        typeof node.chunk_index === 'number' ? Math.floor(node.chunk_index) : 0
      nodes.push({
        title: nodeTitle.slice(0, 200),
        chunk_index: Math.min(Math.max(rawIndex, 0), chunkCount - 1),
      })
    }
    if (nodes.length > 0) {
      chapters.push({
        title: title.slice(0, 200),
        summary: summary.slice(0, 500),
        nodes,
      })
    }
  }
  if (chapters.length === 0) {
    throw new Error('The syllabus had no usable chapters.')
  }
  return chapters
}

// Parses one Gemini answer (initial OR retry for the same lesson) into a flat
// list of validated questions. No node_index, no buckets — each call targets
// exactly one lesson, so we keep at most MAX_QUESTIONS_PER_NODE in order.
export function validateNodeQuestions(value: unknown): GeneratedQuestion[] {
  const root =
    value && typeof value === 'object' && 'questions' in value
      ? (value as { questions: unknown }).questions
      : value
  if (!Array.isArray(root)) return []
  const result: GeneratedQuestion[] = []
  for (const entry of root) {
    if (result.length >= MAX_QUESTIONS_PER_NODE) break
    const question = validateQuestion(entry)
    if (question) result.push(question)
  }
  return result
}

function validateQuestion(entry: unknown): GeneratedQuestion | null {
  if (!entry || typeof entry !== 'object') return null
  const raw = entry as Record<string, unknown>
  // Length caps: AI output is untrusted input — nothing unbounded reaches
  // the database.
  const prompt =
    typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 1000) : ''
  if (!prompt) return null
  const difficulty = toDifficulty(raw.difficulty)
  if (raw.kind === 'fill_blank') {
    const blankCount = (prompt.match(/___/g) ?? []).length
    if (blankCount !== 1) return null
    const accepted = (Array.isArray(raw.accepted) ? raw.accepted : [])
      .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
      .map((a) => a.trim().slice(0, 300))
      .slice(0, 10)
    if (accepted.length === 0) return null
    return { kind: 'fill_blank', difficulty, prompt, options: [], answer: { accepted } }
  }
  if (raw.kind === 'calc') {
    const calc = validateCalcSpec(raw.calc)
    if (!calc) return null
    return { kind: 'calc', difficulty, prompt, options: [], answer: {}, calc }
  }
  if (raw.kind !== 'mcq' && raw.kind !== 'mcq_multi') return null
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    .map((o) => o.trim().slice(0, 300))
    .slice(0, MAX_OPTIONS)
  if (options.length < 2) return null
  const correct = [
    ...new Set(
      (Array.isArray(raw.correct_indexes) ? raw.correct_indexes : [])
        .filter((i): i is number => typeof i === 'number')
        .map((i) => Math.floor(i)),
    ),
  ].filter((i) => i >= 0 && i < options.length)
  if (raw.kind === 'mcq' && correct.length !== 1) return null
  if (raw.kind === 'mcq_multi' && correct.length === 0) return null
  return {
    kind: raw.kind,
    difficulty,
    prompt,
    options,
    answer: { correct_indexes: correct.sort((a, b) => a - b) },
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// `verified` flips true only when the correct answer literally appears in
// the source chunk — a cheap hallucination gate on top of the validator.
export function verifyQuestion(
  question: GeneratedQuestion,
  sourceText: string,
): boolean {
  // A calc question's answer is computed from its stored formula, not quoted
  // from the source, so "verified" means it carries a usable spec.
  if (question.kind === 'calc') return question.calc != null
  const source = normalize(sourceText)
  if (question.kind === 'fill_blank') {
    const accepted = question.answer.accepted ?? []
    return accepted.some((answer) => source.includes(normalize(answer)))
  }
  const correct = question.answer.correct_indexes ?? []
  return (
    correct.length > 0 &&
    correct.every((index) => {
      const option = question.options[index]
      return option !== undefined && source.includes(normalize(option))
    })
  )
}

const LATIN_LANGUAGES = new Set([
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Dutch', 'Romanian', 'Polish', 'Czech', 'Slovak', 'Hungarian',
  'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Turkish', 'Indonesian',
  'Malay', 'Tagalog', 'Swahili',
])

export function isLatinScript(language: string): boolean {
  return LATIN_LANGUAGES.has(language)
}

export function buildSystemPrompt(outputLanguage: string): string {
  if (outputLanguage === 'Vietnamese') {
    return [
      'Bạn viết nội dung giáo dục bằng tiếng Việt.',
      'Mọi tiêu đề chương, tóm tắt, tiêu đề bài học, câu hỏi, lựa chọn và đáp án PHẢI viết bằng tiếng Việt, dù hướng dẫn bằng tiếng Anh và tài liệu gốc có thể bằng ngôn ngữ khác.',
      'Chỉ danh từ riêng, công thức và thuật ngữ chuyên môn trích nguyên văn từ tài liệu gốc mới được giữ nguyên ngôn ngữ.',
      'Chỉ trả lời bằng JSON — không văn xuôi, không code fence.',
    ].join(' ')
  }
  const base = [
    `You write educational content strictly in ${outputLanguage}.`,
    `Every chapter title, summary, lesson title, question, option, and accepted answer MUST be written in ${outputLanguage}, even though these instructions are in English and even when the source material is in a different language.`,
    `Only proper nouns, formulas, and technical terms quoted verbatim from the source may stay in their original language.`,
    `Respond with JSON only — no prose, no code fences.`,
  ].join(' ')
  if (isLatinScript(outputLanguage)) return base
  return base + ` (Repeat: ALL text values in the JSON must be in ${outputLanguage}.)`
}

export function languageReminder(outputLanguage: string): string {
  if (outputLanguage === 'Vietnamese') {
    return '\n\nQUAN TRỌNG: câu trả lời trước đó của bạn chứa nội dung không phải tiếng Việt. Mọi giá trị PHẢI viết bằng tiếng Việt. Dịch bất kỳ từ hoặc cụm từ nào sang tiếng Việt — không sao chép cụm từ từ tài liệu gốc bằng ngôn ngữ gốc của chúng.'
  }
  return `\n\nIMPORTANT: your previous answer contained text that was not in ${outputLanguage}. Every value must be written in ${outputLanguage}. Translate any word or phrase that is in another language — do not copy phrases from the source material in their original language.`
}

// Characters unique to Vietnamese among Latin-script languages: đ, ơ, ư and the
// tonal-stacked vowels (Latin Extended Additional, U+1EA0–U+1EF9). ă/â/ê/ô are
// deliberately excluded — Romanian, French, and Portuguese use them too, so
// they are not a reliable Vietnamese signal in either direction.
const VIETNAMESE_CHARS = /[đĐơƠưƯẠ-ỹ]/

// Cheap bidirectional post-check for the one language we can detect reliably.
// Vietnamese is the only language with a distinctive character set we can spot,
// so it is the only one we police — but we police it BOTH ways. Mismatch
// triggers the single re-ask in chatInLanguage.
export function matchesOutputLanguage(
  text: string,
  outputLanguage: string,
): boolean {
  const decoded = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  )
  const hasVietnamese = VIETNAMESE_CHARS.test(decoded)
  return outputLanguage === 'Vietnamese' ? hasVietnamese : !hasVietnamese
}

export function buildSyllabusPrompt(
  chunks: string[],
  outputLanguage: string,
): string {
  const minNodes = Math.max(3, chunks.length)
  const maxNodes = MAX_CHAPTERS * MAX_NODES_PER_CHAPTER
  const excerpts = chunks
    .map((chunk, index) => `[Chunk ${index}]\n${chunk.slice(0, 2000)}`)
    .join('\n\n')
  return [
    `You are designing a study course in ${outputLanguage} from a student's uploaded materials.`,
    `The materials were split into ${chunks.length} chunks, excerpted below.`,
    `Design a syllabus: at most ${MAX_CHAPTERS} chapters, each with 2-${MAX_NODES_PER_CHAPTER} short lessons ("nodes").`,
    `The material has ${chunks.length} chunks — design ${minNodes}-${maxNodes} total lessons, ensuring every chunk is covered by at least one lesson.`,
    `Each node names the chunk (by index) its content comes from.`,
    `Write every title and summary in ${outputLanguage}, regardless of the materials' language.`,
    `Respond with ONLY this JSON:`,
    `{"chapters":[{"title":"...","summary":"one sentence","nodes":[{"title":"...","chunk_index":0}]}]}`,
    '',
    excerpts,
  ].join('\n')
}

export interface SyllabusQualityResult {
  pass: boolean
  feedback: string
}

export function validateSyllabusQuality(
  syllabus: SyllabusChapter[],
  chunkCount: number,
): SyllabusQualityResult {
  const totalNodes = syllabus.reduce((sum, ch) => sum + ch.nodes.length, 0)
  const minNodes = Math.max(3, chunkCount)
  const problems: string[] = []

  if (totalNodes < minNodes) {
    problems.push(
      `Your syllabus has only ${totalNodes} lessons for ${chunkCount} chunks of material. Design at least ${minNodes} lessons to cover the content adequately.`,
    )
  }

  const used = new Set(
    syllabus.flatMap((ch) => ch.nodes.map((n) => n.chunk_index)),
  )
  const missed = Array.from({ length: chunkCount }, (_, i) => i).filter(
    (i) => !used.has(i),
  )
  if (missed.length > 0) {
    problems.push(
      `Your syllabus skipped chunks ${missed.join(', ')}. Every chunk contains material that must appear in at least one lesson.`,
    )
  }

  const sizes = syllabus.map((ch) => ch.nodes.length)
  if (sizes.length > 1) {
    const maxSize = Math.max(...sizes)
    const minSize = Math.min(...sizes)
    if (minSize > 0 && maxSize / minSize > 2) {
      const bigIdx = sizes.indexOf(maxSize)
      const smallIdx = sizes.indexOf(minSize)
      const sanitize = (t: string) => t.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
      problems.push(
        `Chapter "${sanitize(syllabus[bigIdx].title)}" has ${maxSize} lessons while "${sanitize(syllabus[smallIdx].title)}" has only ${minSize}. Redistribute more evenly.`,
      )
    }
  }

  return { pass: problems.length === 0, feedback: problems.join('\n') }
}

// The lesson's primary chunk plus its two neighbours, deduped. Capped at 8K
// chars — enough context to ground 6 questions without bloating the call.
function nodeSourceContext(node: SyllabusNode, chunks: string[]): string {
  const ci = Math.min(node.chunk_index, Math.max(0, chunks.length - 1))
  return [chunks[ci - 1], chunks[ci], chunks[ci + 1]]
    .filter((c): c is string => typeof c === 'string')
    .join('\n\n')
    .slice(0, 8_000)
}

const FEW_SHOT_EXAMPLE = [
  '{"kind":"mcq","difficulty":"easy","prompt":"What is the defining outcome of mitosis?","options":["Two genetically identical daughter cells","Four haploid gametes","A single polyploid cell","Two cells with halved chromosomes"],"correct_indexes":[0],"accepted":[]}',
  '{"kind":"mcq_multi","difficulty":"medium","prompt":"Which of the following are products of aerobic respiration?","options":["ATP","Carbon dioxide","Ethanol","Water"],"correct_indexes":[0,1,3],"accepted":[]}',
  '{"kind":"fill_blank","difficulty":"medium","prompt":"Osmosis is the movement of ___ across a semipermeable membrane.","options":[],"correct_indexes":[],"accepted":["water"]}',
].join('\n')

// One Gemini call per lesson — both for the initial pass and for the retry
// when the first call came back short. The retry mode lists every question
// already accepted so the model cannot duplicate; otherwise the two modes
// share the same source + format spec + few-shot, so Gemini's implicit cache
// (1024-token min, 75% off cached input on the 2.5 family, ~5 min TTL) kicks
// in on the second hit within the same chapter / for the retry of the same
// lesson. Variable ask sits at the END so the prefix stays bytewise identical.
export function buildNodeQuestionsPrompt(
  node: SyllabusNode,
  existing: GeneratedQuestion[],
  count: number,
  chunks: string[],
  outputLanguage: string,
): string {
  const source = nodeSourceContext(node, chunks)
  const safeTitle = node.title.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
  const lines: string[] = [
    // === STABLE PREFIX (cache-eligible across retries / same chapter) ===
    `Source material:`,
    source,
    ``,
    `Lesson: "${safeTitle}"`,
    ``,
  ]
  if (existing.length > 0) {
    lines.push(
      `Questions that ALREADY exist for this lesson — do not repeat or paraphrase any of them:`,
      ...existing.map(
        (q, i) =>
          `  ${i + 1}. ${q.prompt.replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
      ),
      ``,
    )
  }
  lines.push(
    `For every question:`,
    `- Base the question and answer ONLY on the source text above — never invent facts.`,
    `- Tag "difficulty" as "easy" (recall a stated fact), "medium" (apply or connect ideas), or "hard" (multi-step reasoning). Let the material decide the mix.`,
    `- Write the prompt and every option in ${outputLanguage}.`,
    ``,
    `Use any of these kinds, mixing across the questions:`,
    `- "mcq": one correct option, 3-4 options, give "correct_indexes"`,
    `- "mcq_multi": several correct options, 3-4 options, give "correct_indexes"`,
    `- "fill_blank": student types a missing word/phrase; use exactly ONE ___ blank per question, give "accepted" (copy verbatim from the source)`,
    ``,
    `Constraints:`,
    `- DO NOT write questions answerable by general common sense — every answer must be supported by THIS source text.`,
    existing.length > 0
      ? `- DO NOT duplicate, paraphrase, or invert any existing question above.`
      : `- DO NOT repeat the same concept across questions.`,
    `- DO NOT cluster every question on one paragraph — distribute coverage evenly across the lesson's material.`,
    `- fill_blank questions MUST contain EXACTLY ONE ___ blank in the prompt — never zero, never two or more.`,
    ``,
    `Example of one well-formed question:`,
    FEW_SHOT_EXAMPLE,
    ``,
    // === VARIABLE SUFFIX ===
    `---`,
    `IMPORTANT: fill_blank prompts must contain EXACTLY ONE ___ — no more, no fewer.`,
    existing.length > 0
      ? `Write exactly ${count} NEW quiz questions in ${outputLanguage} for the lesson above.`
      : `Write ${count} quiz questions in ${outputLanguage} for the lesson above.`,
    `Respond with ONLY this JSON:`,
    `{"questions":[{...},{...}]}`,
  )
  return lines.join('\n')
}

// Gemini's responseSchema accepts only the OpenAPI 3.0 subset — NOT full JSON
// Schema. Stick to type/properties/items/required/enum/description; do NOT add
// `additionalProperties` or `propertyOrdering` (the API 400s on both).
// Deliberately NO `minItems` anywhere — Gemini 2.5 Flash treats it as a hard
// constraint and silently truncates or empties the response when it can't be
// met, which is how the previous chapter-batch shape produced 0 questions on
// real source material. Strictness is enforced after the call by the
// validator, not by the schema.
export const SYLLABUS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                chunk_index: { type: 'integer' },
              },
              required: ['title', 'chunk_index'],
            },
          },
        },
        required: ['title', 'summary', 'nodes'],
      },
    },
  },
  required: ['chapters'],
}

// Cheap source-text heuristic — does this lesson's source actually contain
// formulas worth turning into calc questions? Returns true only when the text
// shows at least ONE concrete numerical-relationship marker. The dedicated
// calc call is gated by this; false here means no calc call fires (saves the
// LLM cost). A false positive still costs ~$0.005 because the prompt's
// "return empty array if no formula" escape hatch lets the model bail.
//
// Detection signals (any one triggers true):
//   1. an equals sign between a name and an expression with operators/digits
//   2. an arithmetic operator surrounded by digits (rate × time, P × Q, etc.)
//   3. keywords that name a formula: "formula", "equation", "compute",
//      "calculate", "where x =", "is given by"
//   4. LaTeX-style math markers
//   5. Greek letters typical in formulas
export function detectFormulas(text: string): boolean {
  if (!text) return false
  // Equals sign in a formula context (e.g., "P = 2Q + 10", "MR = MC")
  if (/[A-Za-z][A-Za-z0-9_]*\s*=\s*[^=\n]{1,80}[\d+\-*/^()]/m.test(text)) return true
  // Two-sided arithmetic on numerics (e.g., "5% × 2 years", "100 / 25", "2*x")
  if (/\d\s*[×✕*/^+-]\s*[\d(]/m.test(text)) return true
  // Narrow formula markers — "where X =" / "is given by" / calculus terms.
  // Broad keywords like "formula", "calculate", "equation" are deliberately
  // excluded: they fire on plain narrative ("calculate the present value of...")
  // and were the primary source of false-positive calc calls.
  if (/\b(where\s+[A-Za-z]\s*=|is\s+given\s+by|derivative|integral)\b/i.test(text)) return true
  // LaTeX markers
  if (/\\(frac|sqrt|int|sum|prod|partial|alpha|beta|theta|sigma)\b/i.test(text)) return true
  // Greek-letter usage in body text (not just glossaries)
  if (/[αβγδεθλμπρσφω]/.test(text)) return true
  return false
}

export const NODE_QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['mcq', 'mcq_multi', 'fill_blank'],
            description: 'Question kind.',
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
            description: 'Cognitive difficulty.',
          },
          prompt: {
            type: 'string',
            description: 'The question text shown to the student. For fill_blank, include EXACTLY ONE ___ placeholder.',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Answer options for mcq/mcq_multi; empty array [] for fill_blank.',
          },
          correct_indexes: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Zero-based indexes of correct options for mcq/mcq_multi; empty array [] for fill_blank.',
          },
          accepted: {
            type: 'array',
            items: { type: 'string' },
            description: 'Accepted answer strings for fill_blank, copied verbatim from source; empty array [] for mcq/mcq_multi.',
          },
        },
        required: ['kind', 'difficulty', 'prompt', 'options', 'correct_indexes', 'accepted'],
      },
    },
  },
  required: ['questions'],
}

// Calc-only schema for the dedicated calc follow-up call. Separate from the
// main per-lesson schema so the model never has to choose between mcq and calc
// inside one response — every item in this schema IS calc. No `minItems` (the
// prompt explicitly invites an empty array when the source has no usable
// formula), no `additionalProperties` (Gemini rejects), no `propertyOrdering`.
export const CALC_QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
            description: 'Cognitive difficulty — easy/medium/hard.',
          },
          prompt: {
            type: 'string',
            description: 'Short one-sentence description of what the question asks (the prompt_template carries the actual student-facing wording).',
          },
          calc: {
            type: 'object',
            description: 'The parametric solver spec.',
            properties: {
              variables: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Identifier — letters/digits/underscore, must start with a letter.' },
                    min: { type: 'number' },
                    max: { type: 'number' },
                    decimals: { type: 'integer', description: '0 = whole number.' },
                  },
                  required: ['name', 'min', 'max', 'decimals'],
                },
              },
              steps: {
                type: 'array',
                description: 'Optional ordered intermediate bindings. Each step name binds for later steps and the final formula.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    formula: { type: 'string' },
                  },
                  required: ['name', 'formula'],
                },
              },
              formula: { type: 'string', description: 'Final answer expression over variables and step names.' },
              prompt_template: { type: 'string', description: 'Student-facing wording with {var} placeholders, e.g. "Principal {P} at {r}%...".' },
              decimals: { type: 'integer', description: 'Rounding applied to the computed answer.' },
              tolerance: { type: 'number', description: 'Absolute slack allowed when grading.' },
            },
            required: ['variables', 'formula', 'prompt_template', 'decimals', 'tolerance'],
          },
        },
        required: ['difficulty', 'prompt', 'calc'],
      },
    },
  },
  required: ['questions'],
}

// Parses a calc follow-up response into validated calc questions. Empty array
// is valid (the prompt explicitly tells the model to return one when no real
// formula is in the source). Each question runs through `validateCalcSpec`,
// which midpoint-samples the variable ranges and evaluates every step + the
// final formula — a hallucinated formula referencing an undeclared variable
// or a step that shadows a variable rejects at parse time, before any user
// ever sees the question.
export function validateNodeCalcQuestions(value: unknown): GeneratedQuestion[] {
  const root =
    value && typeof value === 'object' && 'questions' in value
      ? (value as { questions: unknown }).questions
      : value
  if (!Array.isArray(root)) return []
  const result: GeneratedQuestion[] = []
  for (const entry of root) {
    if (result.length >= MAX_QUESTIONS_PER_NODE) break
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const prompt =
      typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 1000) : ''
    if (!prompt) continue
    const calc = validateCalcSpec(raw.calc)
    if (!calc) continue
    result.push({
      kind: 'calc',
      difficulty: toDifficulty(raw.difficulty),
      prompt,
      options: [],
      answer: {},
      calc,
    })
  }
  return result
}

const CALC_FEW_SHOTS = [
  '// Simple single-formula: simple interest.',
  '{"difficulty":"easy","prompt":"Compute simple interest.","calc":{"variables":[{"name":"P","min":500,"max":2000,"decimals":0},{"name":"r","min":2,"max":10,"decimals":0},{"name":"t","min":1,"max":5,"decimals":0}],"formula":"P * r * t / 100","prompt_template":"A principal of {P} earns {r}% simple interest over {t} years. What is the interest?","decimals":2,"tolerance":0.01}}',
  '',
  '// Multi-step (steps[]): consumer surplus from a linear market.',
  '{"difficulty":"medium","prompt":"Consumer surplus at equilibrium.","calc":{"variables":[{"name":"a","min":80,"max":120,"decimals":0},{"name":"b","min":1,"max":3,"decimals":0}],"steps":[{"name":"Q_eq","formula":"a / (b + 1)"},{"name":"P_eq","formula":"a - b * Q_eq"}],"formula":"0.5 * (a - P_eq) * Q_eq","prompt_template":"Demand: P = {a} − {b}Q. Supply: P = Q. What is the consumer surplus?","decimals":2,"tolerance":0.5}}',
  '',
  '// Piecewise via ternary: progressive tax bracket.',
  '{"difficulty":"medium","prompt":"Total tax under a two-bracket schedule.","calc":{"variables":[{"name":"income","min":30,"max":120,"decimals":0}],"formula":"income > 50 ? 50*0.2 + (income-50)*0.3 : income*0.2","prompt_template":"Income {income}k taxed at 20% up to 50k, 30% above. Tax owed?","decimals":2,"tolerance":0.01}}',
  '',
  '// Closed-form with log/sqrt: utility maximisation.',
  '{"difficulty":"hard","prompt":"Optimal utility with a sqrt-substitution.","calc":{"variables":[{"name":"M","min":100,"max":400,"decimals":0}],"steps":[{"name":"x_opt","formula":"sqrt(M / 2)"}],"formula":"log(x_opt + 1)","prompt_template":"Budget {M}. U(x) = log(x+1). Optimal utility?","decimals":4,"tolerance":0.001}}',
  '',
  '// Series summation via sigma: present value of an annuity.',
  '{"difficulty":"hard","prompt":"Present value of a five-year annuity.","calc":{"variables":[{"name":"C","min":100,"max":1000,"decimals":0},{"name":"r","min":2,"max":10,"decimals":0}],"formula":"sigma(1, 5, C / pow(1 + r/100, i))","prompt_template":"An annuity pays {C} at the end of each year for 5 years. Discount rate {r}%. PV?","decimals":2,"tolerance":1}}',
  '',
  '// Combinatorics: binomial probability.',
  '{"difficulty":"medium","prompt":"Probability of exactly k heads in n flips.","calc":{"variables":[{"name":"n","min":4,"max":10,"decimals":0},{"name":"k","min":2,"max":4,"decimals":0}],"formula":"binom_pmf(n, k, 0.5)","prompt_template":"Flip a fair coin {n} times. What is the probability of exactly {k} heads?","decimals":4,"tolerance":0.001}}',
].join('\n')

// Calc follow-up prompt — fired ONLY when `detectFormulas` flagged the lesson
// source. Same stable-prefix layout as the main per-lesson prompt (source +
// DSL spec + few-shots, then the variable ask), so Gemini's implicit cache
// reuses the prefix across a chapter's calc calls.
export function buildCalcQuestionsPrompt(
  node: SyllabusNode,
  count: number,
  chunks: string[],
  outputLanguage: string,
): string {
  const source = nodeSourceContext(node, chunks)
  const safeTitle = node.title.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
  return [
    `Source material:`,
    source,
    ``,
    `Lesson: "${safeTitle}"`,
    ``,
    `You are writing parametric calculation questions for this lesson. Each question stores a SOLVER (variables + optional intermediate steps + a final formula) and a prompt template — the student UI rolls fresh random values each play and the answer is recomputed from the formula, so the question grades itself.`,
    ``,
    `Use ONLY this DSL inside every formula and step:`,
    `- Arithmetic: + - * / % ^   (^ is right-associative; % is floored mod)`,
    `- Comparison: < <= > >= == !=    Logical: && || !    Ternary: cond ? then : else`,
    `- Functions: abs sign min max sqrt cbrt pow mod`,
    `             exp ln log log10 log2 logb`,
    `             sin cos tan asin acos atan atan2  (radians)`,
    `             sinh cosh tanh asinh acosh atanh`,
    `             floor ceil round trunc`,
    `             factorial choose perm gcd lcm`,
    `             sum prod mean median variance stdev  (variadic over numeric args)`,
    `             binom_pmf(n,k,p) binom_cdf(n,k,p) normal_pdf(x,mu,sigma) normal_cdf(x,mu,sigma) poisson_pmf(k,lam) poisson_cdf(k,lam)`,
    `             sigma(lo, hi, body)   pi_iter(lo, hi, body)   iterate(init, count, body)   cases(c1, v1, c2, v2, ..., default)`,
    `             (sigma/pi_iter bind 'i'; iterate binds 'x'; ranges capped at 10000 iterations)`,
    `- Constants: pi, e`,
    `- Variable names: letters/digits/underscore, must start with a letter; cannot shadow a function or constant.`,
    ``,
    `Rules:`,
    `- Base every question on a formula or numerical relationship that is EXPLICITLY stated in the source above. Never invent a formula the source doesn't define.`,
    `- prompt_template uses {var} placeholders for every variable. Write it in ${outputLanguage}.`,
    `- "prompt" is a short label (used internally, also in ${outputLanguage}).`,
    `- Set realistic min/max ranges so the answer stays in a sensible domain (no log of zero, no division by zero, no negative under sqrt).`,
    `- Tolerance should be small but non-zero; decimals matches the precision the student should type.`,
    `- Use "steps" when the answer naturally factors into intermediate quantities (compute Q first, then P, then surplus).`,
    `- Use ternary or "cases" for piecewise definitions (tax brackets, supply/demand kinks).`,
    `- Use "sigma" for series (PV of annuity, Riemann sums), "iterate" for Newton-style root finding.`,
    ``,
    `IMPORTANT: if the source has NO explicit numerical formula you can use, return {"questions":[]} — the lesson will fall back to its mcq/fill_blank questions. Do not invent.`,
    ``,
    `Few-shot examples (one per pattern):`,
    CALC_FEW_SHOTS,
    ``,
    `---`,
    `Write up to ${count} calculation question(s) in ${outputLanguage} for the lesson above. If the source supports fewer, write fewer. If none, return an empty array.`,
    `Respond with ONLY this JSON:`,
    `{"questions":[{...}]}`,
  ].join('\n')
}
