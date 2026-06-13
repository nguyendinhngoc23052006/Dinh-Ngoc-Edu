import { describe, expect, test, vi } from 'vitest'
import {
  describeCorrectAnswer,
  gradeQuestion,
  shuffleLessonQuestions,
} from './lessonService'
import type { Question } from '../types/database'

vi.mock('../lib/supabaseClient', () => ({ supabase: {} }))

function makeQuestion(overrides: Partial<Question>): Question {
  return {
    id: 'q1',
    course_id: 'c1',
    node_id: 'n1',
    position: 1,
    kind: 'mcq',
    difficulty: 'medium',
    prompt: 'Pick one',
    options: ['a', 'b', 'c'],
    answer: { correct_indexes: [1] },
    calc: null,
    verified: true,
    created_at: '2026-06-10T00:00:00Z',
    ...overrides,
  }
}

describe('gradeQuestion', () => {
  test('mcq: right index is correct', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [1] })).toBe(
      'correct',
    )
  })

  test('mcq: wrong index is incorrect', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [0] })).toBe(
      'incorrect',
    )
  })

  test('calc: typed answer is graded against the formula and values', () => {
    const q = makeQuestion({
      kind: 'calc',
      options: [],
      answer: {},
      calc: {
        variables: [{ name: 'x', min: 1, max: 9, decimals: 0 }],
        formula: 'x * 2',
        prompt_template: 'Double {x}',
        decimals: 0,
        tolerance: 0,
      },
    })
    expect(
      gradeQuestion(q, { kind: 'calc', values: { x: 4 }, answer: 8 }),
    ).toBe('correct')
    expect(
      gradeQuestion(q, { kind: 'calc', values: { x: 4 }, answer: 9 }),
    ).toBe('incorrect')
  })

  test('mcq_multi: selection order does not matter', () => {
    const q = makeQuestion({
      kind: 'mcq_multi',
      answer: { correct_indexes: [0, 2] },
    })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [2, 0] })).toBe(
      'correct',
    )
  })

  test('mcq_multi: partial selection is incorrect', () => {
    const q = makeQuestion({
      kind: 'mcq_multi',
      answer: { correct_indexes: [0, 2] },
    })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [0] })).toBe(
      'incorrect',
    )
  })

  test('fill_blank: ignores case and surrounding whitespace', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['Mitochondria'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: '  mitochondria ' })).toBe(
      'correct',
    )
  })

  test('fill_blank: empty answer is incorrect', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['x'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: '   ' })).toBe('incorrect')
  })

  test('mismatched response kind is incorrect', () => {
    const q = makeQuestion({})
    expect(gradeQuestion(q, { kind: 'text', text: 'b' })).toBe('incorrect')
  })

  test('fill_blank: a small typo is partially correct', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['mitochondria'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: 'mitochondira' })).toBe(
      'partial',
    )
  })

  test('fill_blank: the right phrase inside a longer answer is partial', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['photosynthesis'] },
    })
    expect(
      gradeQuestion(q, { kind: 'text', text: 'the photosynthesis process' }),
    ).toBe('partial')
  })

  test('fill_blank: a genuinely different answer stays incorrect', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['mitochondria'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: 'nucleus' })).toBe(
      'incorrect',
    )
  })

  test('fill_blank: a one-letter answer never rides containment to partial', () => {
    const q = makeQuestion({
      kind: 'fill_blank',
      options: [],
      answer: { accepted: ['mitochondria'] },
    })
    expect(gradeQuestion(q, { kind: 'text', text: 'm' })).toBe('incorrect')
  })

  test('a question with no answer key never grades correct', () => {
    const q = makeQuestion({ answer: {} })
    expect(gradeQuestion(q, { kind: 'choice', selectedIndexes: [] })).toBe(
      'incorrect',
    )
  })
})

describe('shuffleLessonQuestions', () => {
  // Deterministic "random" source for repeatable shuffles.
  function seeded(): () => number {
    let state = 42
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
  }

  test('keeps every question and remaps choice answer keys to the new order', () => {
    const questions = [
      makeQuestion({
        id: 'q1',
        options: ['a', 'b', 'c'],
        answer: { correct_indexes: [1] },
      }),
      makeQuestion({
        id: 'q2',
        kind: 'mcq_multi',
        options: ['w', 'x', 'y', 'z'],
        answer: { correct_indexes: [0, 3] },
      }),
      makeQuestion({
        id: 'q3',
        kind: 'fill_blank',
        options: [],
        answer: { accepted: ['sun'] },
      }),
    ]
    const shuffled = shuffleLessonQuestions(questions, seeded())
    expect(shuffled.map((q) => q.id).sort()).toEqual(['q1', 'q2', 'q3'])
    const correctTexts = (indexes: number[], options: string[]) =>
      indexes.map((i) => options[i]).sort()
    for (const original of questions) {
      const copy = shuffled.find((q) => q.id === original.id)!
      if (original.kind === 'fill_blank') {
        expect(copy.answer).toEqual(original.answer)
        continue
      }
      // Same options, possibly new order; the key still names the same texts.
      expect([...copy.options].sort()).toEqual([...original.options].sort())
      expect(
        correctTexts(copy.answer.correct_indexes ?? [], copy.options),
      ).toEqual(
        correctTexts(original.answer.correct_indexes ?? [], original.options),
      )
    }
  })

  test('does not mutate the input', () => {
    const questions = [makeQuestion({ id: 'q1' }), makeQuestion({ id: 'q2' })]
    const snapshot = JSON.parse(JSON.stringify(questions))
    shuffleLessonQuestions(questions, seeded())
    expect(questions).toEqual(snapshot)
  })

  test('actually changes order for a known seed', () => {
    const questions = Array.from({ length: 8 }, (_, i) =>
      makeQuestion({ id: `q${i}` }),
    )
    const shuffled = shuffleLessonQuestions(questions, seeded())
    expect(shuffled.map((q) => q.id)).not.toEqual(questions.map((q) => q.id))
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
