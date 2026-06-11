import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getNodeQuestions } from '../services/lessonService'
import { completeNode } from '../services/progressService'
import LessonPlayer from '../components/lessons/LessonPlayer'

function LessonPage() {
  const { courseId = '', nodeId = '' } = useParams()
  const navigate = useNavigate()
  const state = useAsync(() => getNodeQuestions(nodeId), [nodeId])

  async function handleComplete() {
    await completeNode(nodeId)
    navigate(`/courses/${courseId}`)
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
      ) : (
        <LessonPlayer
          questions={state.data ?? []}
          onComplete={handleComplete}
        />
      )}
    </section>
  )
}

export default LessonPage
