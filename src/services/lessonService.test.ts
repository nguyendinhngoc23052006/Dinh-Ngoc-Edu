import { describe, expect, test, vi } from 'vitest'
import { describeCorrectAnswer, gradeQuestion } from './lessonService'
import type { Question } from '../types/database'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    course_id: 'c1',
    node_id: 'n1',
    position: 1,
    kind: 'mcq',
    prompt: 'Pick one',
    options: ['a', 'b', 'c'],
    answer: { correct_indexes: [1] },
    verified: true,
    created_at: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

describe('gradeQuestion', () => {
  test('mcq: right index is correct', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [1] })).toBe(
      true,
    )
  })

  test('mcq: wrong index is incorrect', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [0] })).toBe(
      false,
    )
  })

  test('mcq_multi: selection order does not matter', () => {
    const q = makeQuestion({
      kind: 'mcq_multi',
      answer: { correct_indexes: [0, 2] },
    })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [2, 0] })).toBe(
      true,
    )
  })

  test('mcq_multi: partial selection is incorrect', () => {
    const q = makeQuestion({
      kind: 'mcq_multi',
      answer: { correct_indexes: [0, 2] },
    })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [0] })).toBe(
      false,
    )
  })

  test('fill_blank: ignores case and surrounding whitespace', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['Mitochondria'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: '  mitochondria ' })).toBe(
      true,
    )
  })

  test('fill_blank: empty answer is incorrect', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['x'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: '   ' })).toBe(false)
  })

  test('mismatched response kind is incorrect', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'text', text: 'b' })).toBe(false)
  })

  test('a question with no answer key never grades correct', () => {
    const q = makeQuestion({ answer: {} })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [] })).toBe(
      false,
    )
  })
})

describe('describeCorrectAnswer', () => {
  test('mcq: names the correct option', () => {
    expect(describeCorrectAnswer(makeQuestion({}))).toBe('b')
  })

  test('mcq_multi: lists every correct option', () => {
    const q = makeQuestion({
      kind: 'mcq_multi',
      answer: { correct_indexes: [0, 2] },
    })
    expect(describeCorrectAnswer(q)).toBe('a, c')
  })

  test('fill_blank: shows the first accepted answer', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['Mitochondria', 'mito'] },
    })
    expect(describeCorrectAnswer(q)).toBe('Mitochondria')
  })

  test('out-of-range indexes are skipped, never "undefined"', () => {
    const q = makeQuestion({ answer: { correct_indexes: [9] } })
    expect(describeCorrectAnswer(q)).toBe('')
  })
})
