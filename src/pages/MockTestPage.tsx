import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getMockTest, getMockTestQuestions } from '../services/mockTestService'
import { getCourseContent } from '../services/lessonService'
import MockTestRunner from '../components/mock-tests/MockTestRunner'

function MockTestPage() {
  const { testId = '' } = useParams()

  const state = useAsync(async () => {
    const test = await getMockTest(testId)
    if (!test) return null
    const questions = await getMockTestQuestions(test)
    // Map node -> chapter title so the results screen can break the score
    // down by chapter and point at weak spots.
    const chapters = await getCourseContent(test.course_id)
    const chapterTitleByNodeId = new Map<string, string>()
    for (const chapter of chapters) {
      for (const node of chapter.nodes) {
        chapterTitleByNodeId.set(node.id, chapter.title)
      }
    }
    return { test, questions, chapterTitleByNodeId }
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

  const { test, questions, chapterTitleByNodeId } = state.data
  return (
    <section>
      <p>
        <Link to={`/courses/${test.course_id}`}>← Back to course</Link>
      </p>
      <h1>{test.title}</h1>
      <MockTestRunner
        questions={questions}
        chapterTitleByNodeId={chapterTitleByNodeId}
      />
    </section>
  )
}

export default MockTestPage
