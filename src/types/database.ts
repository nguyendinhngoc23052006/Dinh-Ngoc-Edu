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
  // Credits awarded the first time the lesson is finished with no mistakes.
  credit_prize: number
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

export interface Profile {
  user_id: string
  credits: number
  pet_enabled: boolean
  // Whether the on-screen pet shows encouragement messages.
  pet_cheers_enabled: boolean
  equipped_theme: string | null
  // Lifetime count of pets raised to a hatch (flavour/history).
  pets_hatched: number
  created_at: string
}

export type PetRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythical'

export type PetStage = 'egg' | 'hatched'

// A catalog entry: a hatchable creature with three evolution sprites. weight
// is the relative hatch drop rate (rarer species carry a smaller weight).
export interface Species {
  id: string
  name: string
  rarity: PetRarity
  weight: number
  form1_sprite: string
  form2_sprite: string
  form3_sprite: string
  sort: number
  created_at: string
}

// One of the signed-in user's pets (≤ 3 in storage, at most one active). An
// egg has species_id null; a hatched pet always carries a species. The
// evolution form is derived from xp (see src/lib/petProgress.ts), never stored.
export interface Pet {
  id: string
  user_id: string
  stage: PetStage
  species_id: string | null
  xp: number
  // The single on-screen companion (at most one true per user).
  is_active: boolean
  hatched_at: string | null
  created_at: string
}

// A food tier: bought with credits, spent to feed a pet for xp_value xp each.
export interface Food {
  id: string
  name: string
  description: string
  price: number
  xp_value: number
  sprite: string
  sort: number
  created_at: string
}

// A row of the user's food stockpile (qty of one food they own).
export interface UserFood {
  user_id: string
  food_id: string
  qty: number
}

// Pets were retired (they come from the pets table now); themes are the only
// cosmetic kind left.
export type CosmeticKind = 'theme'

export interface Cosmetic {
  id: string
  kind: CosmeticKind
  name: string
  description: string
  price: number
  // CSS variable name → value, plus a `dimension` token that re-skins the map.
  data: Record<string, string>
  sort: number
  created_at: string
}

// Records a credit-spending action's idempotency key so a retried call is a
// no-op. Written only by the SECURITY DEFINER spend RPCs; the client never
// selects it, but the row shape is kept here so the schema stays documented.
export interface IdempotencyKey {
  user_id: string
  key: string
  operation: string
  created_at: string
}
