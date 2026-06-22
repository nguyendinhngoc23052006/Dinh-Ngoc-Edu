import { useState } from 'react'
import type { QuestionResponse } from '../../services/lessonService'
import type { Question } from '../../types/database'
import MathText from './MathText'

interface FillBlankQuestionProps {
  question: Question
  onSubmit: (response: QuestionResponse) => void
}

function FillBlankQuestion({ question, onSubmit }: FillBlankQuestionProps) {
  const [text, setText] = useState('')
  const submit = () => {
    if (text.trim().length > 0) onSubmit({ kind: 'text', text })
  }

  return (
    <div className="question">
      <p className="prompt">
        <MathText text={question.prompt} />
      </p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter submits, matching the Check button (no surrounding form).
          if (e.key === 'Enter') submit()
        }}
        placeholder="Type your answer"
      />
      <button
        type="button"
        disabled={text.trim().length === 0}
        onClick={submit}
      >
        Check
      </button>
    </div>
  )
}

export default FillBlankQuestion
