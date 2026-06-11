import { useState } from 'react'
import type { Question } from '../../types/database'
import { gradeQuestion } from '../../services/lessonService'
import type { QuestionResponse } from '../../services/lessonService'
import ChoiceQuestion from '../lessons/ChoiceQuestion'
import FillBlankQuestion from '../lessons/FillBlankQuestion'

interface MockTestRunnerProps {
  questions: Question[]
}

// Exam mode: no per-question feedback, just a score at the end.
function MockTestRunner({ questions }: MockTestRunnerProps) {
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)

  if (questions.length === 0) {
    return (
      <p className="state state-empty">
        No questions in the chosen chapters yet.
      </p>
    )
  }

  const question = questions[index]
  if (!question) {
    return (
      <div className="card">
        <h3>Test finished</h3>
        <p>
          Score: {score} / {questions.length}
        </p>
      </div>
    )
  }

  function handleSubmit(response: QuestionResponse) {
    if (!question) return
    if (gradeQuestion(question, response)) setScore((s) => s + 1)
    setIndex((i) => i + 1)
  }

  return (
    <div className="card">
      <p className="lesson-progress">
        Question {index + 1} of {questions.length}
      </p>
      {question.kind === 'fill_blank' ? (
        <FillBlankQuestion
          key={question.id}
          question={question}
          onSubmit={handleSubmit}
        />
      ) : (
        <ChoiceQuestion
          key={question.id}
          question={question}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  )
}

export default MockTestRunner
