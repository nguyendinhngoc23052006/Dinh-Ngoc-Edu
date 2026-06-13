import { supabase } from '../lib/supabaseClient'

// Lesson completion (and the credit award for a flawless run) is recorded by
// the complete-lesson Edge Function — see lessonService.completeLesson — so the
// balance can only be moved by trusted, re-grading server code. This module
// keeps the read-side progress queries the dashboard and course map use.

const MAX_PROGRESS_NODES = 2000

export interface CourseProgress {
  completed: number
  total: number
}

// Lesson counts + completions for a page of course cards, in two bounded
// queries total (never one per card).
export async function getCourseProgress(
  courseIds: string[],
): Promise<Map<string, CourseProgress>> {
  const progress = new Map<string, CourseProgress>()
  if (courseIds.length === 0) return progress
  for (const id of courseIds) progress.set(id, { completed: 0, total: 0 })

  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select('course_id')
    .in('course_id', courseIds)
    .limit(MAX_PROGRESS_NODES)
  if (nodesError) throw new Error(nodesError.message)
  for (const node of (nodes ?? []) as Array<{ course_id: string }>) {
    const entry = progress.get(node.course_id)
    if (entry) entry.total += 1
  }

  // RLS already scopes node_progress to the caller; the inner join filters
  // the completions down to the listed courses.
  const { data: done, error: doneError } = await supabase
    .from('node_progress')
    .select('node_id, nodes!inner(course_id)')
    .in('nodes.course_id', courseIds)
    .limit(MAX_PROGRESS_NODES)
  if (doneError) throw new Error(doneError.message)
  for (const row of (done ?? []) as unknown as Array<{
    nodes: { course_id: string }
  }>) {
    const entry = progress.get(row.nodes.course_id)
    if (entry) entry.completed += 1
  }
  return progress
}

// Which of the given nodes the signed-in user finished. RLS limits rows to
// the caller, so no explicit user filter is needed.
export async function getCompletedNodeIds(
  nodeIds: string[],
): Promise<Set<string>> {
  if (nodeIds.length === 0) return new Set()
  const { data, error } = await supabase
    .from('node_progress')
    .select('node_id')
    .in('node_id', nodeIds)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<{ node_id: string }>
  return new Set(rows.map((row) => row.node_id))
}
