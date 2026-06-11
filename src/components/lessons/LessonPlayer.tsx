import { useState } from 'react'
import type { Question } from '../../types/database'
import { gradeQuestion } from '../../services/lessonService'
import type { QuestionResponse } from '../../services/lessonService'
import ChoiceQuestion from './ChoiceQuestion'
import FillBlankQuestion from './FillBlankQuestion'

interface LessonPlayerProps {
  questions: Question[]
  onComplete: () => void
}

// Walks the node's questions one at a time with instant feedback, then
// reports completion so the page can record progress.
function LessonPlayer({ questions, onComplete }: LessonPlayerProps) {
  const [index, setIndex] = useState(0)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [score, setScore] = useState(0)

  if (questions.length === 0) {
    return (
      <p className="state state-empty">
        This lesson has no questions yet — generation may still be running.
      </p>
    )
  }

  const question = questions[index]
  if (!question) {
    return (
      <div className="card">
        <h3>Lesson finished</h3>
        <p>
          You got {score} of {questions.length} right.
        </p>
        <button type="button" onClick={onComplete}>
          Finish lesson
        </button>
      </div>
    )
  }

  function handleSubmit(response: QuestionResponse) {
    if (!question) return
    const correct = gradeQuestion(question, response)
    setLastCorrect(correct)
    if (correct) setScore((s) => s + 1)
  }

  function handleNext() {
    setLastCorrect(null)
    setIndex((i) => i + 1)
  }

  return (
    <div className="card lesson-player">
      <progress
        className="lesson-bar"
        value={index}
        max={questions.length}
        aria-label="Lesson progress"
      />
      <p className="lesson-progress">
        Question {index + 1} of {questions.length}
        {question.verified ? ' · verified against your material' : ''}
      </p>
      {lastCorrect === null ? (
        question.kind === 'fill_blank' ? (
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
        )
      ) : (
        <div className="feedback">
          <p className={lastCorrect ? 'state-correct' : 'state-error'}>
            {lastCorrect ? 'Correct!' : 'Not quite.'}
          </p>
          <button type="button" onClick={handleNext}>
            {index + 1 < questions.length ? 'Next question' : 'See results'}
          </button>
        </div>
      )}
    </div>
  )
}

export default LessonPlayer
