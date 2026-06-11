import { Link } from 'react-router-dom'
import type { MockTest } from '../../types/database'

interface MockTestListProps {
  tests: MockTest[]
}

// The user's existing mock tests for one course (most recent first).
function MockTestList({ tests }: MockTestListProps) {
  if (tests.length === 0) {
    return (
      <p className="state state-empty">
        No mock tests yet — create one from this course's chapters.
      </p>
    )
  }
  return (
    <ul className="mock-test-list">
      {tests.map((test) => (
        <li key={test.id}>
          <Link to={`/mock-tests/${test.id}`}>{test.title}</Link>{' '}
          <span className="course-meta">
            {test.question_count} questions · {test.chapter_ids.length} chapter
            {test.chapter_ids.length === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default MockTestList
