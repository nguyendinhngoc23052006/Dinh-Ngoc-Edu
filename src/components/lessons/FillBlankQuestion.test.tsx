import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import type { Question } from '../../types/database'
import FillBlankQuestion from './FillBlankQuestion'

const question: Question = {
  id: 'q1',
  course_id: 'c1',
  node_id: 'n1',
  position: 0,
  kind: 'fill_blank',
  difficulty: 'easy',
  prompt: 'Capital of France?',
  options: [],
  answer: { accepted: ['Paris'] },
  calc: null,
  verified: true,
  created_at: '2026-01-01T00:00:00Z',
}

function checkButton() {
  return screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement
}

describe('FillBlankQuestion', () => {
  test('Check stays disabled for empty / whitespace-only input', async () => {
    render(<FillBlankQuestion question={question} onSubmit={vi.fn()} />)
    expect(checkButton().disabled).toBe(true)

    await userEvent.type(screen.getByPlaceholderText('Type your answer'), '   ')
    expect(checkButton().disabled).toBe(true)
  })

  test('submits the typed text via the Check button', async () => {
    const onSubmit = vi.fn()
    render(<FillBlankQuestion question={question} onSubmit={onSubmit} />)

    await userEvent.type(
      screen.getByPlaceholderText('Type your answer'),
      'Paris',
    )
    await userEvent.click(checkButton())

    expect(onSubmit).toHaveBeenCalledWith({ kind: 'text', text: 'Paris' })
  })

  test('Enter submits, matching the Check button', async () => {
    const onSubmit = vi.fn()
    render(<FillBlankQuestion question={question} onSubmit={onSubmit} />)

    await userEvent.type(
      screen.getByPlaceholderText('Type your answer'),
      'Paris{Enter}',
    )

    expect(onSubmit).toHaveBeenCalledWith({ kind: 'text', text: 'Paris' })
  })

  test('Enter does nothing when the field is empty', async () => {
    const onSubmit = vi.fn()
    render(<FillBlankQuestion question={question} onSubmit={onSubmit} />)

    const input = screen.getByPlaceholderText('Type your answer')
    input.focus()
    await userEvent.keyboard('{Enter}')

    expect(onSubmit).not.toHaveBeenCalled()
  })
})
