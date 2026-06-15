// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CourseCard from './CourseCard'
import type { Course } from '../../types/database'

const course: Course = {
  id: 'course-1',
  owner_id: 'u1',
  title: 'Linear Algebra',
  output_language: 'English',
  visibility: 'public',
  status: 'ready',
  generation_error: null,
  generation_started_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

function renderCard(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('CourseCard', () => {
  test('links to the course and shows status + visibility meta', () => {
    renderCard(<CourseCard course={course} />)

    const link = screen.getByRole('link', { name: 'Linear Algebra' }) as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('/courses/course-1')
    expect(screen.getByText(/English · Ready · Public/)).toBeTruthy()
  })

  test('omits the author line unless authorName is given', () => {
    const { rerender } = renderCard(<CourseCard course={course} />)
    expect(screen.queryByText(/^by /)).toBeNull()

    rerender(
      <MemoryRouter>
        <CourseCard course={course} authorName="Ada" />
      </MemoryRouter>,
    )
    expect(screen.getByText('by Ada')).toBeTruthy()
  })

  test('renders the progress bar only when there is progress', () => {
    renderCard(<CourseCard course={course} progress={{ completed: 3, total: 10 }} />)
    expect(screen.getByText('3 / 10 lessons')).toBeTruthy()

    const bar = document.querySelector('progress') as HTMLProgressElement
    expect(bar.value).toBe(3)
    expect(bar.max).toBe(10)
  })

  test('hides the progress bar when total is zero', () => {
    renderCard(<CourseCard course={course} progress={{ completed: 0, total: 0 }} />)
    expect(document.querySelector('progress')).toBeNull()
  })
})
