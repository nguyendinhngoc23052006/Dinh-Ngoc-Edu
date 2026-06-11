import { useState } from 'react'
import type { Question } from '../../types/database'
import type { QuestionResponse } from '../../services/lessonService'

interface FillBlankQuestionProps {
  question: Question
  onSubmit: (response: QuestionResponse) => void
}

function FillBlankQuestion({ question, onSubmit }: FillBlankQuestionProps) {
  const [text, setText] = useState('')

  return (
    <div className="question">
      <p className="prompt">{question.prompt}</p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type your answer"
      />
      <button
        type="button"
        disabled={text.trim().length === 0}
        onClick={() => onSubmit({ kind: 'text', text })}
      >
        Check
      </button>
    </div>
  )
}

export default FillBlankQuestion
