// Pure helpers for the generate-course pipeline: chunking, prompt building,
// JSON parsing, format enforcement, and answer verification. No Deno or
// network imports, so the sandbox unit tests (vitest) exercise them directly.

export const MAX_CHAPTERS = 8
export const MAX_NODES_PER_CHAPTER = 5
export const QUESTIONS_PER_NODE = 6
const MAX_QUESTIONS_PER_NODE = 12
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

export interface GeneratedQuestion {
  kind: 'mcq' | 'mcq_multi' | 'fill_blank' | 'calc'
  difficulty: Difficulty
  prompt: string
  options: string[]
  answer: { correct_indexes?: number[]; accepted?: string[] }
  // Present only for kind 'calc'.
  calc?: CalcSpec
}

// The AI tags each question's difficulty; anything unrecognized falls back to
// 'medium' so a missing or garbled tag never drops an otherwise-good question.
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

// Slices the extracted text into model-sized chunks on paragraph boundaries.
// The syllabus step assigns each node a chunk_index, and the question step
// sends only that chunk back — that's how a long upload fits a small model.
export function chunkText(
  text: string,
  maxChars = 6000,
  maxChunks = 30,
): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
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
  return chunks.slice(0, maxChunks)
}

// Models wrap JSON in prose or code fences; pull out the first JSON value.
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

// Format enforcement for step 1: keep only well-formed chapters/nodes, cap
// sizes, and clamp every chunk_index into range.
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

// Format enforcement for step 2: one AI answer covers a whole chapter
// (node_index routes each question to its lesson); anything that does not
// match the database contract exactly (kind, options, answer key shape) is
// dropped, never failing the chapter.
export function validateChapterQuestions(
  value: unknown,
  nodeCount: number,
): GeneratedQuestion[][] {
  const root =
    value && typeof value === 'object' && 'questions' in value
      ? (value as { questions: unknown }).questions
      : value
  const buckets: GeneratedQuestion[][] = Array.from(
    { length: nodeCount },
    () => [],
  )
  if (!Array.isArray(root)) return buckets
  for (const entry of root) {
    if (!entry || typeof entry !== 'object') continue
    const rawIndex = (entry as Record<string, unknown>).node_index
    const nodeIndex = typeof rawIndex === 'number' ? Math.floor(rawIndex) : -1
    const bucket = buckets[nodeIndex]
    if (!bucket || bucket.length >= MAX_QUESTIONS_PER_NODE) continue
    const question = validateQuestion(entry)
    if (question) bucket.push(question)
  }
  return buckets
}

// After the chapter call: which lessons still have no questions (the model
// omitted their node_index, or its answer was truncated/unparseable). These
// get one smaller re-ask before the chapter is accepted.
export function emptyNodeIndexes(buckets: GeneratedQuestion[][]): number[] {
  return buckets.flatMap((bucket, index) =>
    bucket.length === 0 ? [index] : [],
  )
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

// Step 4 hallucination check: a question is 'verified' only when its correct
// answer literally appears in the source chunk it was generated from.
export function verifyQuestion(
  question: GeneratedQuestion,
  sourceText: string,
): boolean {
  // A calc question's answer is computed from its formula, not quoted from the
  // text, so "verified" means it carries a usable formula spec.
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

// One system message pins the output language on every call. The user prompts
// are written in English, which pulls small models toward English output —
// especially when the source material is in yet another language — so the
// language rule is stated up front, per field, with the only exception named.
export function buildSystemPrompt(outputLanguage: string): string {
  return [
    `You write educational content strictly in ${outputLanguage}.`,
    `Every chapter title, summary, lesson title, question, option, and accepted answer MUST be written in ${outputLanguage}, even though these instructions are in English and even when the source material is in a different language.`,
    `Only proper nouns, formulas, and technical terms quoted verbatim from the source may stay in their original language.`,
    `Respond with JSON only — no prose, no code fences.`,
  ].join(' ')
}

// Appended to the prompt on the single retry after a language-drift detection.
// Covers both failures the post-check catches: a wrong-language answer, and an
// answer that mixed in stray text from another language (the reported bug — a
// Vietnamese phrase inside an English course).
export function languageReminder(outputLanguage: string): string {
  return `\n\nIMPORTANT: your previous answer contained text that was not in ${outputLanguage}. Every value must be written in ${outputLanguage}. Translate any word or phrase that is in another language — do not copy phrases from the source material in their original language.`
}

// Characters unique to Vietnamese among Latin-script languages: đ, ơ, ư and the
// tonal-stacked vowels (Latin Extended Additional, U+1EA0–U+1EF9). ă/â/ê/ô are
// deliberately excluded — Romanian, French, and Portuguese use them too, so
// they are not a reliable Vietnamese signal in either direction.
const VIETNAMESE_CHARS = /[đĐơƠưƯẠ-ỹ]/

// Cheap bidirectional post-check for the one language we can detect reliably.
// Vietnamese is the only language with a distinctive character set we can spot,
// so it is the only one we police — but we police it BOTH ways:
//   • a Vietnamese course must actually contain Vietnamese, and
//   • a non-Vietnamese course must NOT contain Vietnamese (the reported bug:
//     a Vietnamese phrase leaking into an English/other-language course).
// Mismatch triggers the single re-ask in chatInLanguage. Pairs of other
// languages we cannot detect still pass — no heuristic beats accepting there.
export function matchesOutputLanguage(
  text: string,
  outputLanguage: string,
): boolean {
  // Some API responses JSON-escape non-ASCII as \uXXXX; decode before testing
  // so Vietnamese characters are detected even when serialised that way.
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
  const excerpts = chunks
    .map((chunk, index) => `[Chunk ${index}]\n${chunk.slice(0, 600)}`)
    .join('\n\n')
  return [
    `You are designing a study course in ${outputLanguage} from a student's uploaded materials.`,
    `The materials were split into ${chunks.length} chunks, excerpted below.`,
    `Design a syllabus: at most ${MAX_CHAPTERS} chapters, each with 2-${MAX_NODES_PER_CHAPTER} short lessons ("nodes").`,
    `Each node names the chunk (by index) its content comes from.`,
    `Write every title and summary in ${outputLanguage}, regardless of the materials' language.`,
    `Respond with ONLY this JSON:`,
    `{"chapters":[{"title":"...","summary":"one sentence","nodes":[{"title":"...","chunk_index":0}]}]}`,
    '',
    excerpts,
  ].join('\n')
}

// Minimal single-lesson prompt used as a last-resort third retry when the
// full-chapter and chapter-re-ask calls both failed to produce questions for a
// node. One chunk, one lesson, no calc example — far less likely to truncate.
export function buildNodeQuestionsPrompt(
  node: SyllabusNode,
  chunks: string[],
  outputLanguage: string,
): string {
  const source = (chunks[node.chunk_index] ?? chunks[0] ?? '').slice(0, 8_000)
  // Strip double-quotes from the AI-generated title before embedding it inside
  // a double-quoted instruction segment — a title that contains `"` would
  // otherwise distort the prompt boundary and could cause unexpected output.
  const safeTitle = node.title.replace(/"/g, "'")
  return [
    `Write ${QUESTIONS_PER_NODE} quiz questions in ${outputLanguage} for a lesson titled "${safeTitle}".`,
    `Base every question and answer ONLY on the source text below — never invent facts.`,
    `Mix "mcq", "mcq_multi", and "fill_blank" kinds. Tag each with "difficulty": "easy", "medium", or "hard".`,
    `For mcq/mcq_multi give 3-4 options and the correct option indexes. For fill_blank give short accepted answers copied verbatim from the source.`,
    `Respond with ONLY this JSON (use node_index 0 for all questions):`,
    `{"questions":[{"node_index":0,"kind":"mcq","difficulty":"easy","prompt":"...","options":["...","..."],"correct_indexes":[0]}]}`,
    '',
    source,
  ].join('\n')
}

// One prompt covers a whole chapter — one AI call per chapter instead of one
// per node keeps a full course within free-tier request limits.
export function buildChapterQuestionsPrompt(
  chapter: SyllabusChapter,
  chunks: string[],
  outputLanguage: string,
): string {
  const lessonList = chapter.nodes
    .map(
      (node, index) =>
        `${index}: "${node.title}" (source chunk ${node.chunk_index})`,
    )
    .join('\n')
  const usedIndexes = [...new Set(chapter.nodes.map((n) => n.chunk_index))]
  const sources = usedIndexes
    .map(
      (i) => `[Chunk ${i}]\n${(chunks[i] ?? chunks[0] ?? '').slice(0, 8000)}`,
    )
    .join('\n\n')
  return [
    `Write quiz questions in ${outputLanguage} for the chapter "${chapter.title}" of a study course.`,
    `The chapter has these lessons (node_index: title, with its source chunk):`,
    lessonList,
    `Write exactly ${QUESTIONS_PER_NODE} questions per lesson. Base every question and answer ONLY on that lesson's source chunk below — never invent facts.`,
    `Mix the kinds: "mcq" (one correct option), "mcq_multi" (several correct options), "fill_blank" (the student types a missing word or phrase).`,
    `For mcq/mcq_multi give 3-4 options and the correct option indexes. For fill_blank give the accepted answers (short, copied from the source) and no options.`,
    `Only when the source states a formula or numeric relationship, you MAY use kind "calc": give a short "prompt" instruction and a "calc" object with "variables" (each {"name","min","max","decimals"}), a "formula" over ONLY those names (operators + - * / ^ and parentheses), a "prompt_template" embedding every variable as {name}, plus "decimals" and "tolerance" for the answer. Use realistic ranges from the material. Never invent a calc question when the source has no formula.`,
    `Tag every question with "difficulty": "easy", "medium", or "hard", judged from the source itself — recalling a single stated fact is "easy", applying or connecting ideas is "medium", multi-step reasoning or synthesis is "hard". Let the material decide the mix: do not make every question the same difficulty, and do not force hard questions onto simple material.`,
    `Write every prompt and every option in ${outputLanguage}, regardless of the source chunk's language — a question in one language must never expect an answer in another.`,
    `Respond with ONLY this JSON (node_index says which lesson the question belongs to):`,
    `{"questions":[{"node_index":0,"kind":"mcq","difficulty":"easy","prompt":"...","options":["...","..."],"correct_indexes":[0]},{"node_index":1,"kind":"fill_blank","difficulty":"hard","prompt":"... ____ ...","accepted":["..."]},{"node_index":0,"kind":"calc","difficulty":"medium","prompt":"Compute the simple interest.","calc":{"variables":[{"name":"P","min":1000,"max":5000,"decimals":0},{"name":"r","min":1,"max":10,"decimals":0},{"name":"t","min":1,"max":5,"decimals":0}],"formula":"P*r*t/100","prompt_template":"Principal {P} at {r}% for {t} years — interest?","decimals":2,"tolerance":0.01}}]}`,
    '',
    sources,
  ].join('\n')
}
