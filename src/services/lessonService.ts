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

// Pure client-side grading against the stored answer key (the key itself was
// AI-verified against the material at generation time).
export function gradeQuestion(
  question: Question,
  response: QuestionResponse,
): boolean {
  if (question.kind === 'fill_blank') {
    if (response.kind !== 'text') return false
    const given = response.text.trim().toLowerCase()
    if (given.length === 0) return false
    const accepted = question.answer.accepted ?? []
    return accepted.some((answer) => answer.trim().toLowerCase() === given)
  }
  if (response.kind !== 'choice') return false
  const correct = [...(question.answer.correct_indexes ?? [])].sort()
  const selected = [...response.selectedIndexes].sort()
  return (
    correct.length > 0 &&
    correct.length === selected.length &&
    correct.every((value, index) => value === selected[index])
  )
}
