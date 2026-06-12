import { supabase } from '../lib/supabaseClient'
import type { Chapter, LessonNode, Question } from '../types/database'

const MAX_CHAPTERS = 100
const MAX_NODES = 500
const MAX_QUESTIONS_PER_NODE = 50

export interface ChapterWithNodes extends Chapter {
  nodes: LessonNode[]
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
    .select()
    .eq('course_id', courseId)
    .order('position', { ascending: true })
    .limit(MAX_NODES)
  if (nodesError) throw new Error(nodesError.message)

  const byChapter = new Map<string, LessonNode[]>()
  for (const node of (nodes ?? []) as LessonNode[]) {
    const list = byChapter.get(node.chapter_id) ?? []
    list.push(node)
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

export type Grade = 'correct' | 'partial' | 'incorrect'

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
    if (question.kind === 'fill_blank') return question
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
