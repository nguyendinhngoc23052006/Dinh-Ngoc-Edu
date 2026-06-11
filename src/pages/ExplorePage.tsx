import { useState } from 'react'
import { useAsync } from '../hooks/useAsync'
import { listPublicCourses, PAGE_SIZE } from '../services/courseService'
import { saveCourse } from '../services/savedCourseService'
import CourseCard from '../components/courses/CourseCard'

function ExplorePage() {
  const [page, setPage] = useState(0)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const state = useAsync(() => listPublicCourses(page), [page])

  async function handleSave(courseId: string) {
    setError(null)
    try {
      await saveCourse(courseId)
      setSavedIds((current) => [...current, courseId])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Save failed.')
    }
  }

  const courses = state.data ?? []
  return (
    <section>
      <h1>Explore public courses</h1>
      {error ? <p className="state state-error">{error}</p> : null}
      {state.loading ? (
        <p className="state state-loading">Loading public courses…</p>
      ) : state.error ? (
        <p className="state state-error">
          {state.error}{' '}
          <button type="button" onClick={state.reload}>
            Retry
          </button>
        </p>
      ) : courses.length === 0 ? (
        <p className="state state-empty">
          {page === 0
            ? 'No public courses yet — share one of yours from its course page.'
            : 'No more courses.'}
        </p>
      ) : (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              action={
                <button
                  type="button"
                  disabled={savedIds.includes(course.id)}
                  onClick={() => handleSave(course.id)}
                >
                  {savedIds.includes(course.id) ? 'Saved' : 'Save'}
                </button>
              }
            />
          ))}
        </div>
      )}
      <div className="pager">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={courses.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  )
}

export default ExplorePage
