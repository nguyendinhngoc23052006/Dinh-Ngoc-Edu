import { useState } from 'react'
import type { Question } from '../../types/database'
import {
  correctAnswerText,
  gradeQuestion,
} from '../../services/lessonService'
import type { Grade, QuestionResponse } from '../../services/lessonService'
import ChoiceQuestion from '../lessons/ChoiceQuestion'
import FillBlankQuestion from '../lessons/FillBlankQuestion'
import CalcQuestion from '../lessons/CalcQuestion'

interface MockTestRunnerProps {
  questions: Question[]
  chapterTitleByNodeId: Map<string, string>
}

interface ChapterScore {
  title: string
  correct: number
  total: number
}

// Exam mode: no per-question feedback; at the end, the overall score plus a
// per-chapter breakdown that highlights weak spots.
function MockTestRunner({
  questions,
  chapterTitleByNodeId,
}: MockTestRunnerProps) {
  const [index, setIndex] = useState(0)
  const [gradeByIndex, setGradeByIndex] = useState<Grade[]>([])
  // Kept alongside the grade so the end-of-test review can show a calc
  // question's correct answer, which depends on the values rolled for this take.
  const [responseByIndex, setResponseByIndex] = useState<QuestionResponse[]>([])

  if (questions.length === 0) {
    return (
      <p className="state state-empty">
        No questions in the chosen chapters yet.
      </p>
    )
  }

  const question = questions[index]
  if (!question) {
    // A near-miss on a typed answer counts toward the score, like in lessons.
    const score = gradeByIndex.filter((grade) => grade !== 'incorrect').length
    const byChapter = new Map<string, ChapterScore>()
    questions.forEach((q, i) => {
      const title = chapterTitleByNodeId.get(q.node_id) ?? 'Other'
      const entry = byChapter.get(title) ?? { title, correct: 0, total: 0 }
      entry.total += 1
      if (gradeByIndex[i] !== 'incorrect') entry.correct += 1
      byChapter.set(title, entry)
    })
    return (
      <div className="card">
        <h3>Test finished</h3>
        <p>
          Score: {score} / {questions.length}
        </p>
        <h4>By chapter</h4>
        <ul className="chapter-breakdown">
          {[...byChapter.values()].map((entry) => (
            <li key={entry.title}>
              {entry.title}: {entry.correct} / {entry.total}
              {entry.correct < entry.total ? ' — review this chapter' : ''}
            </li>
          ))}
        </ul>
        {score < questions.length ? (
          <>
            <h4>Review your mistakes</h4>
            <ul className="mistake-list">
              {questions.map((q, i) =>
                gradeByIndex[i] !== 'incorrect' ? null : (
                  <li key={q.id}>
                    <p>{q.prompt}</p>
                    <p className="state-correct">
                      Correct answer: {correctAnswerText(q, responseByIndex[i])}
                    </p>
                  </li>
                ),
              )}
            </ul>
          </>
        ) : null}
      </div>
    )
  }

  function handleSubmit(response: QuestionResponse) {
    if (!question) return
    const grade = gradeQuestion(question, response)
    setGradeByIndex((current) => [...current, grade])
    setResponseByIndex((current) => [...current, response])
    setIndex((i) => i + 1)
  }

  return (
    <div className="card">
      <progress
        className="lesson-bar"
        value={index}
        max={questions.length}
        aria-label="Test progress"
      />
      <p className="lesson-progress">
        Question {index + 1} of {questions.length}
      </p>
      {question.kind === 'calc' ? (
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
      )}
    </div>
  )
}

export default MockTestRunner
