import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import {
  deleteCourse,
  getCourse,
  renameCourse,
  setCourseVisibility,
} from '../services/courseService'
import { getCourseContent } from '../services/lessonService'
import { getCompletedNodeIds } from '../services/progressService'
import { cloneCourse, saveCourse } from '../services/savedCourseService'
import { startGeneration } from '../services/generationService'
import CourseMap from '../components/courses/CourseMap'
import CourseSettings from '../components/courses/CourseSettings'
import VisibilityToggle from '../components/courses/VisibilityToggle'
import type { Visibility } from '../types/database'

const POLL_MS = 4000

function CoursePage() {
  const { courseId = '' } = useParams()
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)

  const state = useAsync(async () => {
    const course = await getCourse(courseId)
    if (!course) return null
    const chapters = await getCourseContent(courseId)
    const nodeIds = chapters.flatMap((c) => c.nodes.map((n) => n.id))
    // Guests have no progress rows; skip the query, render an untouched path.
    const completed = session
      ? await getCompletedNodeIds(nodeIds)
      : new Set<string>()
    return { course, chapters, completed }
  }, [courseId, session?.user.id])

  // While the AI pipeline runs, poll until the status leaves 'processing'.
  const processing = state.data?.course.status === 'processing'
  const reload = state.reload
  useEffect(() => {
    if (!processing) return
    const timer = setInterval(reload, POLL_MS)
    return () => clearInterval(timer)
  }, [processing, reload])

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

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : failure)
    } finally {
      setBusy(false)
    }
  }

  function handleVisibility(next: Visibility) {
    void run(async () => {
      await setCourseVisibility(course.id, next)
      state.reload()
    }, 'Update failed.')
  }

  function handleRename(title: string) {
    void run(async () => {
      await renameCourse(course.id, title)
      state.reload()
    }, 'Rename failed.')
  }

  function handleDelete() {
    void run(async () => {
      await deleteCourse(course.id)
      navigate('/dashboard')
    }, 'Delete failed.')
  }

  function handleSave() {
    void run(async () => {
      await saveCourse(course.id)
      setSavedNote(true)
    }, 'Save failed.')
  }

  function handleClone() {
    void run(async () => {
      const newCourseId = await cloneCourse(course.id)
      navigate(`/courses/${newCourseId}`)
    }, 'Clone failed.')
  }

  function handleRetryGeneration() {
    void run(async () => {
      await startGeneration(course.id)
      state.reload()
    }, 'Could not restart generation.')
  }

  return (
    <div>
      <div className="page-header">
        <h1>{course.title}</h1>
        {session ? (
          <Link className="cta" to={`/courses/${course.id}/mock-tests/new`}>
            Create mock test
          </Link>
        ) : null}
      </div>
      <p className="course-meta">
        {course.output_language} · status: {course.status}
      </p>
      {course.status === 'processing' ? (
        <p className="state state-loading">
          Generation in progress — chapters and lessons appear here when the AI
          finishes scanning your materials. This page refreshes itself.
        </p>
      ) : null}
      {course.status === 'failed' ? (
        <p className="state state-error">
          Generation failed
          {course.generation_error ? `: ${course.generation_error}` : '.'}{' '}
          {isOwner ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleRetryGeneration}
            >
              Retry generation
            </button>
          ) : null}
        </p>
      ) : null}
      {isOwner ? (
        <>
          <VisibilityToggle
            visibility={course.visibility}
            busy={busy}
            onChange={handleVisibility}
          />
          <CourseSettings
            title={course.title}
            busy={busy}
            onRename={handleRename}
            onDelete={handleDelete}
          />
        </>
      ) : session ? (
        <p className="visitor-actions">
          <button
            type="button"
            disabled={busy || savedNote}
            onClick={handleSave}
          >
            {savedNote ? 'Saved to your dashboard' : 'Save to my courses'}
          </button>{' '}
          <button type="button" disabled={busy} onClick={handleClone}>
            Clone to my account
          </button>
        </p>
      ) : (
        <p className="card">
          <Link to="/login" state={{ from: location.pathname }}>
            Log in
          </Link>{' '}
          to study this course, track progress, or save your own copy.
        </p>
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
