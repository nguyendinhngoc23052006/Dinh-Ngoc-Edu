import { supabase } from '../lib/supabaseClient'
import { requireUserId } from './authService'
import { PAGE_SIZE } from './courseService'
import type { MockTest, Question } from '../types/database'

export const MAX_TEST_QUESTIONS = 100
const MAX_CANDIDATE_QUESTIONS = 500
const MAX_TEST_NODES = 500
const MAX_TEST_CHAPTERS = 50

// Returns a human-readable problem, or null when the input is usable.
export function validateNewMockTest(
  title: string,
  chapterIds: string[],
  questionCount: number,
): string | null {
  if (title.trim().length === 0) return 'Give the mock test a title.'
  if (chapterIds.length === 0) return 'Pick at least one chapter.'
  if (chapterIds.length > MAX_TEST_CHAPTERS) {
    return `Pick at most ${MAX_TEST_CHAPTERS} chapters.`
  }
  if (
    !Number.isInteger(questionCount) ||
    questionCount < 1 ||
    questionCount > MAX_TEST_QUESTIONS
  ) {
    return `Choose between 1 and ${MAX_TEST_QUESTIONS} questions.`
  }
  return null
}

export async function createMockTest(
  courseId: string,
  title: string,
  chapterIds: string[],
  questionCount: number,
): Promise<MockTest> {
  const problem = validateNewMockTest(title, chapterIds, questionCount)
  if (problem) throw new Error(problem)
  const ownerId = await requireUserId()

  // chapter_ids is a plain uuid[] (no FK), so verify every chosen chapter
  // really belongs to this course before storing the selection.
  const { data: known, error: chaptersError } = await supabase
    .from('chapters')
    .select('id')
    .eq('course_id', courseId)
    .in('id', chapterIds)
  if (chaptersError) throw new Error(chaptersError.message)
  if (((known ?? []) as Array<{ id: string }>).length !== chapterIds.length) {
    throw new Error('Every chapter must belong to this course.')
  }

  const { data, error } = await supabase
    .from('mock_tests')
    .insert({
      course_id: courseId,
      owner_id: ownerId,
      title: title.trim(),
      chapter_ids: chapterIds,
      question_count: questionCount,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as MockTest
}

export async function getMockTest(testId: string): Promise<MockTest | null> {
  const { data, error } = await supabase
    .from('mock_tests')
    .select()
    .eq('id', testId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as MockTest | null
}

export async function listMyMockTests(
  courseId: string,
  page = 0,
): Promise<MockTest[]> {
  const ownerId = await requireUserId()
  const { data, error } = await supabase
    .from('mock_tests')
    .select()
    .eq('owner_id', ownerId)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) throw new Error(error.message)
  return (data ?? []) as MockTest[]
}

// Fisher-Yates shuffle then slice: every candidate has an equal chance of
// being drawn, so each test run is a fresh random selection. `random` is
// injectable for deterministic tests.
export function sampleQuestions<T>(
  items: T[],
  count: number,
  random: () => number = Math.random,
): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = pool[i] as T
    pool[i] = pool[j] as T
    pool[j] = a
  }
  return pool.slice(0, count)
}

// Pulls the test's questions live from the course content (the generated
// course is the source of truth), then randomly samples the requested number.
export async function getMockTestQuestions(
  test: MockTest,
): Promise<Question[]> {
  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select('id')
    .in('chapter_id', test.chapter_ids)
    .limit(MAX_TEST_NODES)
  if (nodesError) throw new Error(nodesError.message)
  const nodeIds = ((nodes ?? []) as Array<{ id: string }>).map((n) => n.id)
  if (nodeIds.length === 0) return []

  const { data, error } = await supabase
    .from('questions')
    .select()
    .in('node_id', nodeIds)
    .limit(MAX_CANDIDATE_QUESTIONS)
  if (error) throw new Error(error.message)
  return sampleQuestions((data ?? []) as Question[], test.question_count)
}
