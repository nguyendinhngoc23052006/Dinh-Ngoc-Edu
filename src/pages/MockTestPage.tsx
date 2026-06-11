import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getMockTest, getMockTestQuestions } from '../services/mockTestService'
import MockTestRunner from '../components/mock-tests/MockTestRunner'

function MockTestPage() {
  const { testId = '' } = useParams()

  const state = useAsync(async () => {
    const test = await getMockTest(testId)
    if (!test) return null
    const questions = await getMockTestQuestions(test)
    return { test, questions }
  }, [testId])

  if (state.loading) {
    return <p className="state state-loading">Loading mock test…</p>
  }
  if (state.error) {
    return (
      <p className="state state-error">
        {state.error}{' '}
        <button type="button" onClick={state.reload}>
          Retry
        </button>
      </p>
    )
  }
  if (!state.data) {
    return <p className="state state-empty">Mock test not found.</p>
  }

  const { test, questions } = state.data
  return (
    <section>
      <p>
        <Link to={`/courses/${test.course_id}`}>← Back to course</Link>
      </p>
      <h1>{test.title}</h1>
      <MockTestRunner questions={questions} />
    </section>
  )
}

export default MockTestPage
