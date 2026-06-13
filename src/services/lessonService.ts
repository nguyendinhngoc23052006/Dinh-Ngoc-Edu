import { supabase } from '../lib/supabaseClient'
import { gradeCalc } from '../../supabase/functions/_shared/calc'
import type { SubmittedAnswer } from '../../supabase/functions/_shared/grade'
import type { Chapter, LessonNode, Question } from '../types/database'

const MAX_CHAPTERS = 100
const MAX_NODES = 500
const MAX_QUESTIONS_PER_NODE = 50

// question_count lets the course page spot lessons that generation left
// empty (the "ready but no questions" repair path).
export interface LessonNodeWithCount extends LessonNode {
  question_count: number
}

export interface ChapterWithNodes extends Chapter {
  nodes: LessonNodeWithCount[]
}

// Loads a whole course's outline in two queries (no per-chapter round trips):
// both tables carry course_id exactly for this read.
export async function getCourseContent(
  courseId: string,
): Promise<ChapterWithNodes[]> {
  const { data: chapters, error: chaptersError } = await supabase
    .from('chapters')
    .select()
    .eq('course_id', courseId)
    .order('position', { ascending: true })
    .limit(MAX_CHAPTERS)
  if (chaptersError) throw new Error(chaptersError.message)

  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select('*, questions(count)')
    .eq('course_id', courseId)
    .order('position', { ascending: true })
    .limit(MAX_NODES)
  if (nodesError) throw new Error(nodesError.message)

  const byChapter = new Map<string, LessonNodeWithCount[]>()
  for (const row of (nodes ?? []) as Array<
    LessonNode & { questions: Array<{ count: number }> }
  >) {
    const { questions, ...node } = row
    const list = byChapter.get(node.chapter_id) ?? []
    list.push({ ...node, question_count: questions[0]?.count ?? 0 })
    byChapter.set(node.chapter_id, list)
  }
  return ((chapters ?? []) as Chapter[]).map((chapter) => ({
    ...chapter,
    nodes: byChapter.get(chapter.id) ?? [],
  }))
}

export async function getNodeQuestions(nodeId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from('questions')
    .select()
    .eq('node_id', nodeId)
    .order('position', { ascending: true })
    .limit(MAX_QUESTIONS_PER_NODE)
  if (error) throw new Error(error.message)
  return (data ?? []) as Question[]
}

export type QuestionResponse =
  | { kind: 'choice'; selectedIndexes: number[] }
  | { kind: 'text'; text: string }
  | { kind: 'calc'; values: Record<string, number>; answer: number }

export type Grade = 'correct' | 'partial' | 'incorrect'

export interface LessonSubmission {
  questionId: string
  answer: SubmittedAnswer
}

export interface LessonResult {
  completed: boolean
  flawless: boolean
  creditAwarded: number
  balance: number
}

// Converts a graded UI response into the by-value answer the server re-grades
// (option TEXTS, not shuffled indexes), so the credit check can't be fooled by
// the client and survives option shuffling.
export function toSubmission(
  question: Question,
  response: QuestionResponse,
): LessonSubmission {
  if (response.kind === 'choice') {
    return {
      questionId: question.id,
      answer: {
        kind: 'choice',
        selected: response.selectedIndexes.map(
          (index) => question.options[index] ?? '',
        ),
      },
    }
  }
  if (response.kind === 'calc') {
    return {
      questionId: question.id,
      answer: { kind: 'calc', values: response.values, answer: response.answer },
    }
  }
  return { questionId: question.id, answer: { kind: 'text', text: response.text } }
}

// Records completion and awards the lesson's credit prize when every answer is
// correct. All real grading-for-credit happens server-side in the Edge
// Function; this only carries the by-value answers there.
export async function completeLesson(
  nodeId: string,
  responses: LessonSubmission[],
): Promise<LessonResult> {
  const { data, error } = await supabase.functions.invoke('complete-lesson', {
    body: { nodeId, responses },
  })
  if (error) throw new Error(error.message)
  return data as LessonResult
}

function normalizeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Edit distance, for near-miss detection on typed answers. Inputs are capped
// at generation time (accepted ≤ 300 chars), so the quadratic cost is fine.
function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

// A typed answer that is nearly the accepted one (a typo, a missing accent,
// an extra word around the right phrase) counts as partially correct, so a
// student who clearly knew the answer is not graded like one who didn't.
function isNearMiss(given: string, accepted: string): boolean {
  if (accepted.length >= 4 && (given.includes(accepted) || accepted.includes(given))) {
    return given.length >= 4
  }
  const distance = levenshtein(given, accepted)
  return 1 - distance / Math.max(given.length, accepted.length) >= 0.8
}

// Pure client-side grading against the stored answer key (the key itself was
// AI-verified against the material at generation time).
export function gradeQuestion(
  question: Question,
  response: QuestionResponse,
): Grade {
  if (question.kind === 'calc') {
    if (response.kind !== 'calc' || !question.calc) return 'incorrect'
    return gradeCalc(question.calc, response.values, response.answer)
      ? 'correct'
      : 'incorrect'
  }
  if (question.kind === 'fill_blank') {
    if (response.kind !== 'text') return 'incorrect'
    const given = normalizeText(response.text)
    if (given.length === 0) return 'incorrect'
    const accepted = (question.answer.accepted ?? []).map(normalizeText)
    if (accepted.some((answer) => answer === given)) return 'correct'
    if (accepted.some((answer) => isNearMiss(given, answer))) return 'partial'
    return 'incorrect'
  }
  if (response.kind !== 'choice') return 'incorrect'
  const correct = [...(question.answer.correct_indexes ?? [])].sort()
  const selected = [...response.selectedIndexes].sort()
  return correct.length > 0 &&
    correct.length === selected.length &&
    correct.every((value, index) => value === selected[index])
    ? 'correct'
    : 'incorrect'
}

// A fresh question order — and a fresh option order inside each choice
// question, with the answer key remapped — every time a lesson is taken.
export function shuffleLessonQuestions(
  questions: Question[],
  random: () => number = Math.random,
): Question[] {
  const shuffled = shuffle(questions, random)
  return shuffled.map((question) => {
    // Only choice questions have options to reorder; fill_blank and calc carry
    // no options, so they pass through untouched.
    if (question.kind === 'fill_blank' || question.kind === 'calc') return question
    const order = shuffle(
      question.options.map((_, index) => index),
      random,
    )
    return {
      ...question,
      options: order.map((index) => question.options[index] ?? ''),
      answer: {
        correct_indexes: (question.answer.correct_indexes ?? [])
          .map((index) => order.indexOf(index))
          .filter((index) => index !== -1)
          .sort((a, b) => a - b),
      },
    }
  })
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = result[i] as T
    result[i] = result[j] as T
    result[j] = a
  }
  return result
}

// Human-readable correct answer, shown after a wrong response.
export function describeCorrectAnswer(question: Question): string {
  if (question.kind === 'fill_blank') {
    return question.answer.accepted?.[0] ?? ''
  }
  return (question.answer.correct_indexes ?? [])
    .map((index) => question.options[index])
    .filter((option): option is string => option !== undefined)
    .join(', ')
}
