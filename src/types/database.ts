// Row types mirroring supabase/migrations/20260610213500_core_schema.sql.
// Keep in lockstep with the migration in the same PR.

import type { CalcSpec } from '../../supabase/functions/_shared/calc'

export type Visibility = 'private' | 'public'

export type CourseStatus = 'pending' | 'processing' | 'ready' | 'failed'

export type QuestionKind = 'mcq' | 'fill_blank' | 'mcq_multi' | 'calc'

export type QuestionDifficulty = 'easy' | 'medium' | 'hard'

export interface Course {
  id: string
  owner_id: string
  title: string
  output_language: string
  visibility: Visibility
  status: CourseStatus
  generation_error: string | null
  generation_started_at: string | null
  created_at: string
}

export type ExtractStatus = 'pending' | 'ready' | 'failed'

export interface CourseMaterial {
  id: string
  course_id: string
  owner_id: string
  file_name: string
  storage_path: string
  extract_status: ExtractStatus
  extract_error: string | null
  extracted_path: string | null
  extracted_chars: number | null
  created_at: string
}

export interface Chapter {
  id: string
  course_id: string
  position: number
  title: string
  summary: string
  created_at: string
}

export interface LessonNode {
  id: string
  course_id: string
  chapter_id: string
  position: number
  title: string
  created_at: string
}

// The answer key, by kind: mcq and mcq_multi use correct_indexes into
// options; fill_blank uses accepted strings.
export interface QuestionAnswer {
  correct_indexes?: number[]
  accepted?: string[]
}

export interface Question {
  id: string
  course_id: string
  node_id: string
  position: number
  kind: QuestionKind
  difficulty: QuestionDifficulty
  prompt: string
  options: string[]
  answer: QuestionAnswer
  // Only set for kind 'calc': the formula + variables the UI rolls each take.
  calc: CalcSpec | null
  verified: boolean
  created_at: string
}

export interface NodeProgress {
  user_id: string
  node_id: string
  completed_at: string
}

export interface MockTest {
  id: string
  course_id: string
  owner_id: string
  title: string
  chapter_ids: string[]
  question_count: number
  created_at: string
}

export interface SavedCourse {
  user_id: string
  course_id: string
  created_at: string
}
