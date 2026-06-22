import { describe, expect, test } from 'vitest'
import { isExactlyCorrect, isFlawless } from './grade'
import type { GradableQuestion, SubmittedAnswer } from './grade'

const mcq: GradableQuestion = {
  kind: 'mcq',
  options: ['Mitochondria', 'Nucleus', 'Ribosome'],
  answer: { correct_indexes: [0] },
  calc: null,
}

const mcqMulti: GradableQuestion = {
  kind: 'mcq_multi',
  options: ['A', 'B', 'C'],
  answer: { correct_indexes: [0, 2] },
  calc: null,
}

const fill: GradableQuestion = {
  kind: 'fill_blank',
  options: [],
  answer: { accepted: ['Sun', 'the sun'] },
  calc: null,
}

const calc: GradableQuestion = {
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
}

describe('isExactlyCorrect', () => {
  test('mcq matches by option text, not index (survives shuffling)', () => {
    expect(
      isExactlyCorrect(mcq, { kind: 'choice', selected: ['Mitochondria'] }),
    ).toBe(true)
    expect(
      isExactlyCorrect(mcq, { kind: 'choice', selected: ['Nucleus'] }),
    ).toBe(false)
  })

  test('mcq_multi needs the exact set — no missing, no extra', () => {
    expect(
      isExactlyCorrect(mcqMulti, { kind: 'choice', selected: ['C', 'A'] }),
    ).toBe(true)
    expect(
      isExactlyCorrect(mcqMulti, { kind: 'choice', selected: ['A'] }),
    ).toBe(false)
    expect(
      isExactlyCorrect(mcqMulti, { kind: 'choice', selected: ['A', 'B', 'C'] }),
    ).toBe(false)
  })

  test('fill_blank is an exact normalized match (no fuzzy credit)', () => {
    expect(isExactlyCorrect(fill, { kind: 'text', text: '  the SUN ' })).toBe(
      true,
    )
    expect(isExactlyCorrect(fill, { kind: 'text', text: 'sunn' })).toBe(false)
  })

  test('calc re-computes from the submitted values', () => {
    expect(
      isExactlyCorrect(calc, { kind: 'calc', values: { x: 4 }, answer: 8 }),
    ).toBe(true)
    expect(
      isExactlyCorrect(calc, { kind: 'calc', values: { x: 4 }, answer: 7 }),
    ).toBe(false)
  })

  test('a mismatched answer kind is never correct', () => {
    expect(isExactlyCorrect(mcq, { kind: 'text', text: 'Mitochondria' })).toBe(
      false,
    )
  })
})

describe('isFlawless', () => {
  const questions = [mcq, fill]
  const idOf = (index: number) => `q${index}`

  test('true only when every question is answered correctly', () => {
    const answers = new Map<string, SubmittedAnswer>([
      ['q0', { kind: 'choice', selected: ['Mitochondria'] }],
      ['q1', { kind: 'text', text: 'sun' }],
    ])
    expect(isFlawless(questions, answers, idOf)).toBe(true)
  })

  test('false when any question is wrong', () => {
    const answers = new Map<string, SubmittedAnswer>([
      ['q0', { kind: 'choice', selected: ['Nucleus'] }],
      ['q1', { kind: 'text', text: 'sun' }],
    ])
    expect(isFlawless(questions, answers, idOf)).toBe(false)
  })

  test('false when a question is unanswered', () => {
    const answers = new Map<string, SubmittedAnswer>([
      ['q0', { kind: 'choice', selected: ['Mitochondria'] }],
    ])
    expect(isFlawless(questions, answers, idOf)).toBe(false)
  })

  test('false for an empty lesson', () => {
    expect(isFlawless([], new Map(), idOf)).toBe(false)
  })
})
