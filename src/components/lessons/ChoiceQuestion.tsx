import { useState } from 'react'
import type { QuestionResponse } from '../../services/lessonService'
import type { Question } from '../../types/database'
import MathText from './MathText'

interface ChoiceQuestionProps {
  question: Question // kind 'mcq' (single answer) or 'mcq_multi'
  onSubmit: (response: QuestionResponse) => void
}

function ChoiceQuestion({ question, onSubmit }: ChoiceQuestionProps) {
  const [selected, setSelected] = useState<number[]>([])
  const multi = question.kind === 'mcq_multi'

  function toggle(index: number) {
    if (multi) {
      setSelected((current) =>
        current.includes(index)
          ? current.filter((value) => value !== index)
          : [...current, index],
      )
    } else {
      setSelected([index])
    }
  }

  return (
    <div className="question">
      <p className="prompt">
        <MathText text={question.prompt} />
      </p>
      {multi ? <p className="hint">Select all that apply.</p> : null}
      <ul className="options">
        {question.options.map((option, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: options are plain strings with no stable ID
          <li key={index}>
            <label>
              <input
                type={multi ? 'checkbox' : 'radio'}
                name={question.id}
                checked={selected.includes(index)}
                onChange={() => toggle(index)}
              />
              <MathText text={option} />
            </label>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={selected.length === 0}
        onClick={() => onSubmit({ kind: 'choice', selectedIndexes: selected })}
      >
        Check
      </button>
    </div>
  )
}

export default ChoiceQuestion
