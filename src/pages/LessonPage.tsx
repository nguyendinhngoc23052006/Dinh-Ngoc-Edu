import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import LessonPlayer from '../components/lessons/LessonPlayer'
import { useProfile } from '../hooks/profileContext'
import { useAsync } from '../hooks/useAsync'
import {
  completeLesson,
  getNodeQuestions,
  shuffleLessonQuestions,
} from '../services/lessonService'
import type { LessonResult, LessonSubmission } from '../services/lessonService'

function LessonPage() {
  const { courseId = '', nodeId = '' } = useParams()
  const { refresh } = useProfile()
  const state = useAsync(() => getNodeQuestions(nodeId), [nodeId])
  const [completeError, setCompleteError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<LessonResult | null>(null)
  // A fresh question and option order per take, fixed for the take's duration.
  const questions = useMemo(
    () => shuffleLessonQuestions(state.data ?? []),
    [state.data],
  )

  async function handleComplete(responses: LessonSubmission[]) {
    setCompleteError(null)
    setSubmitting(true)
    try {
      const outcome = await completeLesson(nodeId, responses)
      setResult(outcome)
      // The balance changed if credit was awarded — refresh the nav badge.
      if (outcome.creditAwarded > 0) refresh()
    } catch (cause) {
      setCompleteError(
        cause instanceof Error ? cause.message : 'Could not save progress.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section>
      <p>
        <Link to={`/courses/${courseId}`}>← Back to course</Link>
      </p>
      {state.loading ? (
        <p className="state state-loading">Loading lesson…</p>
      ) : state.error ? (
        <p className="state state-error">
          {state.error}{' '}
          <button type="button" onClick={state.reload}>
            Retry
          </button>
        </p>
      ) : result ? (
        <div className="card lesson-result">
          <h2>{result.flawless ? 'Flawless! 🎉' : 'Lesson complete'}</h2>
          {result.creditAwarded > 0 ? (
            <p className="credit-earned">
              You earned <strong>{result.creditAwarded}</strong> credits.
            </p>
          ) : result.flawless ? (
            <p>You already earned this lesson's credits.</p>
          ) : (
            <p>Finish with no mistakes to earn this lesson's credits.</p>
          )}
          <Link className="button-link" to={`/courses/${courseId}`}>
            Back to course
          </Link>
        </div>
      ) : (
        <>
          {completeError ? (
            <p className="state state-error">{completeError}</p>
          ) : null}
          <LessonPlayer
            questions={questions}
            onComplete={handleComplete}
            submitting={submitting}
          />
        </>
      )}
    </section>
  )
}

export default LessonPage
