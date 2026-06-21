import { useRef, useState } from 'react'
import type { Question } from '../../types/database'
import {
  correctAnswerText,
  gradeQuestion,
  toSubmission,
} from '../../services/lessonService'
import type {
  Grade,
  LessonSubmission,
  QuestionResponse,
} from '../../services/lessonService'
import ChoiceQuestion from './ChoiceQuestion'
import FillBlankQuestion from './FillBlankQuestion'
import CalcQuestion from './CalcQuestion'
import MathText from './MathText'

interface LessonPlayerProps {
  questions: Question[]
  onComplete: (responses: LessonSubmission[]) => void
  submitting?: boolean
}

// Walks the node's questions one at a time with instant feedback, collecting
// each answer by value, then hands the set to the page to record completion
// and award credit (re-graded server-side).
function LessonPlayer({ questions, onComplete, submitting }: LessonPlayerProps) {
  const [index, setIndex] = useState(0)
  const [lastGrade, setLastGrade] = useState<Grade | null>(null)
  const [lastResponse, setLastResponse] = useState<QuestionResponse | null>(null)
  const [score, setScore] = useState(0)
  // Answers accumulate in a ref so re-renders don't reset them; only the final
  // submit reads them.
  const responses = useRef<LessonSubmission[]>([])

  if (questions.length === 0) {
    return (
      <p className="state state-empty">
        This lesson has no questions — if generation has finished, the course
        page offers the owner a Regenerate option to fill empty lessons.
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
        <button
          type="button"
          disabled={submitting}
          onClick={() => onComplete(responses.current)}
        >
          {submitting ? 'Saving…' : 'Finish lesson'}
        </button>
      </div>
    )
  }

  function handleSubmit(response: QuestionResponse) {
    if (!question) return
    const grade = gradeQuestion(question, response)
    setLastGrade(grade)
    setLastResponse(response)
    responses.current.push(toSubmission(question, response))
    // A near-miss still shows the student knew the answer — count it.
    if (grade !== 'incorrect') setScore((s) => s + 1)
  }

  function handleNext() {
    setLastGrade(null)
    setLastResponse(null)
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
        <span className={`difficulty-badge difficulty-${question.difficulty}`}>
          {question.difficulty}
        </span>
        {question.verified ? ' · verified against your material' : ''}
      </p>
      {lastGrade === null ? (
        question.kind === 'calc' ? (
          <CalcQuestion
            key={question.id}
            question={question}
            onSubmit={handleSubmit}
          />
        ) : question.kind === 'fill_blank' ? (
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
          <p className="question-prompt"><MathText text={question.prompt} /></p>
          <div
            role="alert"
            className={
              lastGrade === 'correct'
                ? 'feedback-popup feedback-popup-correct'
                : lastGrade === 'partial'
                  ? 'feedback-popup feedback-popup-partial'
                  : 'feedback-popup feedback-popup-wrong'
            }
          >
            <p className="feedback-title">
              {lastGrade === 'correct'
                ? 'Correct!'
                : lastGrade === 'partial'
                  ? 'Close enough — partially correct!'
                  : 'Not quite.'}
            </p>
            {lastGrade === 'correct' ? null : (
              <p>
                {lastGrade === 'partial' ? 'Exact answer: ' : 'Correct answer: '}
                <strong>
                  {correctAnswerText(question, lastResponse ?? undefined)}
                </strong>
              </p>
            )}
            <button type="button" onClick={handleNext}>
              {index + 1 < questions.length ? 'Continue' : 'See results'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default LessonPlayer
