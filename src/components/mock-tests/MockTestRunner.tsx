import { useState } from 'react'
import type { Question } from '../../types/database'
import { gradeQuestion } from '../../services/lessonService'
import type { QuestionResponse } from '../../services/lessonService'
import ChoiceQuestion from '../lessons/ChoiceQuestion'
import FillBlankQuestion from '../lessons/FillBlankQuestion'

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
  const [correctByIndex, setCorrectByIndex] = useState<boolean[]>([])

  if (questions.length === 0) {
    return (
      <p className="state state-empty">
        No questions in the chosen chapters yet.
      </p>
    )
  }

  const question = questions[index]
  if (!question) {
    const score = correctByIndex.filter(Boolean).length
    const byChapter = new Map<string, ChapterScore>()
    questions.forEach((q, i) => {
      const title = chapterTitleByNodeId.get(q.node_id) ?? 'Other'
      const entry = byChapter.get(title) ?? { title, correct: 0, total: 0 }
      entry.total += 1
      if (correctByIndex[i]) entry.correct += 1
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
      </div>
    )
  }

  function handleSubmit(response: QuestionResponse) {
    if (!question) return
    const correct = gradeQuestion(question, response)
    setCorrectByIndex((current) => [...current, correct])
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
