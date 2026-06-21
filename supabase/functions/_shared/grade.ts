// Server-side EXACT grading for credit award. The client grades leniently for
// feedback (near-misses count), but earning credit requires a flawless lesson,
// so the server re-grades every answer strictly against the stored key — never
// trusting a client-sent verdict. Answers arrive by VALUE (selected option
// texts, typed text, or calc variable values), so client-side option shuffling
// does not matter. Pure (no Deno/DOM), shared with the browser bundle's tests.

import { gradeCalc, validateCalcSpec } from './calc.ts'
import type { CalcSpec } from './calc.ts'

export interface GradableQuestion {
  kind: 'mcq' | 'mcq_multi' | 'fill_blank' | 'calc'
  options: string[]
  answer: { correct_indexes?: number[]; accepted?: string[] }
  calc: CalcSpec | null
}

// What the client submits per question, keyed for server verification.
export type SubmittedAnswer =
  | { kind: 'choice'; selected: string[] } // selected option TEXTS
  | { kind: 'text'; text: string }
  | { kind: 'calc'; values: Record<string, number>; answer: number }

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isExactlyCorrect(
  question: GradableQuestion,
  answer: SubmittedAnswer,
): boolean {
  if (question.kind === 'calc') {
    if (answer.kind !== 'calc' || question.calc == null) return false
    // Re-validate the spec read from the DB before we evaluate it. A tampered
    // row with an at-the-cap sigma range would otherwise burn ~10K iterations
    // per regrade before the runtime cap fires; midpoint-sample validation
    // rejects it cheaply. RLS already scopes writes to the owner, but this
    // closes the avoidable-cost surface anyway.
    const spec = validateCalcSpec(question.calc)
    if (spec == null) return false
    return gradeCalc(spec, answer.values, answer.answer)
  }
  if (question.kind === 'fill_blank') {
    if (answer.kind !== 'text') return false
    const given = normalize(answer.text)
    if (given.length === 0) return false
    return (question.answer.accepted ?? []).map(normalize).includes(given)
  }
  // mcq / mcq_multi: the set of selected option texts must equal the set of
  // correct option texts exactly (no missing, no extra, no duplicates).
  if (answer.kind !== 'choice') return false
  const correct = (question.answer.correct_indexes ?? [])
    .map((index) => question.options[index])
    .filter((option): option is string => option !== undefined)
    .map(normalize)
  const selected = answer.selected.map(normalize)
  if (correct.length === 0 || correct.length !== selected.length) return false
  if (new Set(selected).size !== selected.length) return false
  const correctSet = new Set(correct)
  return selected.every((option) => correctSet.has(option))
}

// A lesson is flawless only when every question has a matching, correct answer
// (a skipped question is a missing answer, so it is not flawless).
export function isFlawless(
  questions: GradableQuestion[],
  answers: Map<string, SubmittedAnswer>,
  idOf: (index: number) => string,
): boolean {
  if (questions.length === 0) return false
  return questions.every((question, index) => {
    const answer = answers.get(idOf(index))
    return answer !== undefined && isExactlyCorrect(question, answer)
  })
}
