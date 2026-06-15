// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CalcQuestion from './CalcQuestion'
import type { CalcSpec } from '../../../supabase/functions/_shared/calc'
import type { Question } from '../../types/database'

// A spec with no variables renders a fixed prompt, so the rolled instance is
// deterministic without stubbing Math.random.
const fixedCalc: CalcSpec = {
  variables: [],
  formula: '2 + 3',
  prompt_template: 'What is 2 + 3?',
  decimals: 0,
  tolerance: 0,
}

function makeQuestion(calc: CalcSpec | null): Question {
  return {
    id: 'q1',
    course_id: 'c1',
    node_id: 'n1',
    position: 0,
    kind: 'calc',
    difficulty: 'medium',
    prompt: 'Solve the calculation',
    options: [],
    answer: {},
    calc,
    verified: true,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function checkButton() {
  return screen.getByRole('button', { name: 'Check' }) as HTMLButtonElement
}

describe('CalcQuestion', () => {
  test('renders the rolled statement and submits the typed numeric answer + values', async () => {
    const onSubmit = vi.fn()
    render(<CalcQuestion question={makeQuestion(fixedCalc)} onSubmit={onSubmit} />)

    expect(screen.getByText('Solve the calculation')).toBeTruthy()
    expect(screen.getByText('What is 2 + 3?')).toBeTruthy()
    expect(checkButton().disabled).toBe(true)

    await userEvent.type(screen.getByLabelText('Your numeric answer'), '5')
    expect(checkButton().disabled).toBe(false)
    await userEvent.click(checkButton())

    expect(onSubmit).toHaveBeenCalledWith({ kind: 'calc', values: {}, answer: 5 })
  })

  test('shows an unavailable message when the question has no calc spec', () => {
    render(<CalcQuestion question={makeQuestion(null)} onSubmit={vi.fn()} />)
    expect(screen.getByText('This question is unavailable.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Check' })).toBeNull()
  })
})
