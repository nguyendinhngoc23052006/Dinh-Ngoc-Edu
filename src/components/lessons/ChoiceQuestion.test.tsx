import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import type { Question } from '../../types/database'
import ChoiceQuestion from './ChoiceQuestion'

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    course_id: 'c1',
    node_id: 'n1',
    position: 0,
    kind: 'mcq',
    difficulty: 'easy',
    prompt: 'Pick the right one',
    options: ['Alpha', 'Beta', 'Gamma'],
    answer: { correct_indexes: [1] },
    calc: null,
    verified: true,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function checkButton() {
  return screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement
}

describe('ChoiceQuestion', () => {
  test('single-choice: Check is disabled until an option is picked, then submits one index', async () => {
    const onSubmit = vi.fn()
    render(<ChoiceQuestion question={makeQuestion()} onSubmit={onSubmit} />)

    expect(checkButton().disabled).toBe(true)

    await userEvent.click(screen.getByLabelText('Beta'))
    expect(checkButton().disabled).toBe(false)
    await userEvent.click(checkButton())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'choice',
      selectedIndexes: [1],
    })
  })

  test('single-choice: picking another option replaces the selection', async () => {
    const onSubmit = vi.fn()
    render(<ChoiceQuestion question={makeQuestion()} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByLabelText('Alpha'))
    await userEvent.click(screen.getByLabelText('Gamma'))
    await userEvent.click(checkButton())

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'choice',
      selectedIndexes: [2],
    })
  })

  test('multi-choice: accumulates and toggles indexes, shows the hint', async () => {
    const onSubmit = vi.fn()
    render(
      <ChoiceQuestion
        question={makeQuestion({ kind: 'mcq_multi' })}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByText('Select all that apply.')).toBeTruthy()

    await userEvent.click(screen.getByLabelText('Alpha'))
    await userEvent.click(screen.getByLabelText('Gamma'))
    await userEvent.click(screen.getByLabelText('Alpha')) // toggle off
    await userEvent.click(checkButton())

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'choice',
      selectedIndexes: [2],
    })
  })
})
