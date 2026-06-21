import { useMemo, useState } from 'react'
import { generateInstance } from '../../../supabase/functions/_shared/calc'
import type { Question } from '../../types/database'
import type { QuestionResponse } from '../../services/lessonService'
import MathText from './MathText'

interface CalcQuestionProps {
  question: Question
  onSubmit: (response: QuestionResponse) => void
}

// Calculation question: rolls a fresh set of random values for this take (the
// player re-mounts on every new attempt via its key), fills them into the
// prompt, and submits the typed answer alongside the values so it can be
// graded — and later re-graded server-side — against the formula.
function CalcQuestion({ question, onSubmit }: CalcQuestionProps) {
  const instance = useMemo(
    () => (question.calc ? generateInstance(question.calc) : null),
    [question.calc],
  )
  const [value, setValue] = useState('')

  if (!instance) {
    return <p className="state state-empty">This question is unavailable.</p>
  }

  return (
    <div className="question">
      <p className="prompt"><MathText text={question.prompt} /></p>
      <p className="calc-statement"><MathText text={instance.prompt} /></p>
      <input
        type="number"
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your numeric answer"
        aria-label="Your numeric answer"
      />
      <button
        type="button"
        disabled={value.trim().length === 0}
        onClick={() =>
          onSubmit({
            kind: 'calc',
            values: instance.values,
            answer: Number(value.trim()),
          })
        }
      >
        Check
      </button>
    </div>
  )
}

export default CalcQuestion
