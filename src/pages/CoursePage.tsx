import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { getCourse, setCourseVisibility } from '../services/courseService'
import { getCourseContent } from '../services/lessonService'
import { getCompletedNodeIds } from '../services/progressService'
import { saveCourse } from '../services/savedCourseService'
import CourseMap from '../components/courses/CourseMap'
import VisibilityToggle from '../components/courses/VisibilityToggle'
import type { Visibility } from '../types/database'

function CoursePage() {
  const { courseId = '' } = useParams()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const state = useAsync(async () => {
    const course = await getCourse(courseId)
    if (!course) return null
    const chapters = await getCourseContent(courseId)
    const nodeIds = chapters.flatMap((c) => c.nodes.map((n) => n.id))
    const completed = await getCompletedNodeIds(nodeIds)
    return { course, chapters, completed }
  }, [courseId])

  if (state.loading) {
    return <p className="state state-loading">Loading course…</p>
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
    return (
      <p className="state state-empty">
        Course not found — it may be private or deleted.
      </p>
    )
  }

  const { course, chapters, completed } = state.data
  const isOwner = session?.user.id === course.owner_id

  async function handleVisibility(next: Visibility) {
    setBusy(true)
    setActionError(null)
    try {
      await setCourseVisibility(course.id, next)
      state.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Update failed.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSave() {
    setBusy(true)
    setActionError(null)
    try {
      await saveCourse(course.id)
      setSavedNote(true)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>{course.title}</h1>
        <Link className="cta" to={`/courses/${course.id}/mock-tests/new`}>
          Create mock test
        </Link>
      </div>
      <p className="course-meta">
        {course.output_language} · status: {course.status}
      </p>
      {course.status === 'processing' ? (
        <p className="state state-loading">
          Generation in progress — chapters and lessons appear here when the AI
          finishes scanning your materials.
        </p>
      ) : null}
      {isOwner ? (
        <VisibilityToggle
          visibility={course.visibility}
          busy={busy}
          onChange={handleVisibility}
        />
      ) : (
        <button type="button" disabled={busy || savedNote} onClick={handleSave}>
          {savedNote ? 'Saved to your dashboard' : 'Save to my courses'}
        </button>
      )}
      {actionError ? <p className="state state-error">{actionError}</p> : null}
      <CourseMap
        courseId={course.id}
        chapters={chapters}
        completedNodeIds={completed}
      />
    </div>
  )
}

export default CoursePage
