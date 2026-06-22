import { render, screen } from '@testing-library/react'
// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { supabaseMock } from '../../test/supabaseMock'
import type { Course } from '../../types/database'

// OwnerCourseControls renders MaterialsManager, which imports materialService →
// supabaseClient (throws at import without env). Mock the client so the block
// renders; no service round-trips are exercised here.
vi.mock('../../lib/supabaseClient', () => ({ supabase: supabaseMock.client }))

import OwnerCourseControls from './OwnerCourseControls'

const course: Course = {
  id: 'course-1',
  owner_id: 'u1',
  title: 'Linear Algebra',
  output_language: 'English',
  visibility: 'private',
  status: 'ready',
  generation_error: null,
  generation_started_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

function renderControls(overrides: Partial<Course> = {}) {
  return render(
    <OwnerCourseControls
      course={{ ...course, ...overrides }}
      materials={[]}
      busy={false}
      onVisibility={() => {}}
      onRename={() => {}}
      onDelete={() => {}}
      onMaterialsChanged={() => {}}
    />,
  )
}

describe('OwnerCourseControls', () => {
  test('renders the owner management controls', () => {
    renderControls()
    expect(screen.getByRole('button', { name: 'Make public' })).toBeTruthy()
    expect(screen.getByText('Source materials')).toBeTruthy()
    expect(screen.getByText('Course settings')).toBeTruthy()
  })

  // A finished course's only working "Regenerate course" affordance lives in
  // CoursePage, shown when a ready course has empty lessons. This block must
  // never render a regenerate button — for a ready course it was a dead no-op
  // (the generate-course function returns 200 without re-running).
  test('shows no "Regenerate course" button for a finished (ready) course', () => {
    renderControls({ status: 'ready' })
    expect(
      screen.queryByRole('button', { name: 'Regenerate course' }),
    ).toBeNull()
  })

  test('shows no "Regenerate course" button for a pending course either', () => {
    renderControls({ status: 'pending' })
    expect(
      screen.queryByRole('button', { name: 'Regenerate course' }),
    ).toBeNull()
  })
})
