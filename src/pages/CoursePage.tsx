import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import CourseMap from '../components/courses/CourseMap'
import OwnerCourseControls from '../components/courses/OwnerCourseControls'
import MockTestList from '../components/mock-tests/MockTestList'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../hooks/useAuth'
import { statusLabel } from '../lib/courseLabels'
import {
  deleteCourse,
  getCourse,
  renameCourse,
  setCourseVisibility,
} from '../services/courseService'
import { startGeneration } from '../services/generationService'
import { getCourseContent } from '../services/lessonService'
import { listMaterials } from '../services/materialService'
import {
  deleteMockTest,
  listMyMockTests,
  renameMockTest,
} from '../services/mockTestService'
import { getDisplayNames } from '../services/profileService'
import { getCompletedNodeIds } from '../services/progressService'
import { cloneCourse, saveCourse } from '../services/savedCourseService'
import type { Visibility } from '../types/database'

const POLL_MS = 4000
// Stop telling the user "almost there" after this long; the run is likely
// crashed (the pipeline itself gives up well before this).
const POLL_TIMEOUT_MS = 10 * 60 * 1000

function CoursePage() {
  const { courseId = '' } = useParams()
  const { session } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState(false)
  const [stalled, setStalled] = useState(false)

  const state = useAsync(async () => {
    const course = await getCourse(courseId)
    if (!course) return null
    const owner = session?.user.id === course.owner_id
    // Show who wrote it when viewing someone else's course (public authors only).
    const authorName = owner
      ? null
      : ((await getDisplayNames([course.owner_id])).get(course.owner_id) ??
        null)
    const [chapters, mockTests, materials] = await Promise.all([
      getCourseContent(courseId),
      session ? listMyMockTests(courseId) : Promise.resolve([]),
      // Materials are owner-only (RLS); the owner manages them here at any time.
      owner ? listMaterials(courseId) : Promise.resolve([]),
    ])
    const nodeIds = chapters.flatMap((c) => c.nodes.map((n) => n.id))
    // Guests have no progress rows; skip the query, render an untouched path.
    const completed = session
      ? await getCompletedNodeIds(nodeIds)
      : new Set<string>()
    return { course, chapters, completed, mockTests, materials, authorName }
  }, [courseId, session?.user.id])

  // While the AI pipeline runs, poll the status only (one PK lookup per
  // tick) and reload the full page once it leaves the generating states.
  const status = state.data?.course.status
  const generating = status === 'pending' || status === 'processing'
  const reload = state.reload
  useEffect(() => {
    if (!generating) return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      void (async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setStalled(true)
          return
        }
        try {
          const fresh = await getCourse(courseId)
          if (
            fresh &&
            fresh.status !== 'pending' &&
            fresh.status !== 'processing'
          ) {
            reload()
          }
        } catch {
          // Transient fetch problem; the next tick tries again.
        }
      })()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [generating, courseId, reload])

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

  const { course, chapters, completed, mockTests, materials, authorName } =
    state.data
  const isOwner = session?.user.id === course.owner_id
  const failedMaterials = materials.filter(
    (material) => material.extract_status === 'failed',
  )
  // An upload/generation failure handed over by NewCoursePage on creation.
  const uploadError =
    (location.state as { uploadError?: string } | null)?.uploadError ?? null

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

  function handleStartGeneration() {
    setStalled(false)
    void run(async () => {
      await startGeneration(course.id)
      state.reload()
    }, 'Could not start generation.')
  }

  function handleRegenerate() {
    if (
      course.visibility === 'public' &&
      !window.confirm(
        'This course is public. Regenerating it will reset progress for any students currently studying it. Proceed?',
      )
    )
      return
    setStalled(false)
    void run(async () => {
      await startGeneration(course.id, true)
      state.reload()
    }, 'Could not start regeneration.')
  }

  function handleRenameTest(id: string, title: string) {
    void run(async () => {
      await renameMockTest(id, title)
      state.reload()
    }, 'Rename failed.')
  }

  function handleDeleteTest(id: string) {
    void run(async () => {
      await deleteMockTest(id)
      state.reload()
    }, 'Delete failed.')
  }

  const startButton = (
    <button type="button" disabled={busy} onClick={handleStartGeneration}>
      {course.status === 'failed' ? 'Retry generation' : 'Start generation'}
    </button>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{course.title}</h1>
          {authorName ? <p className="course-author">by {authorName}</p> : null}
        </div>
        {session && course.status === 'ready' ? (
          <Link className="cta" to={`/courses/${course.id}/mock-tests/new`}>
            Create mock test
          </Link>
        ) : null}
      </div>
      <p className="course-meta">
        {course.output_language} · {statusLabel(course.status)}
      </p>
      {uploadError ? (
        <p className="state state-error">
          Creating this course hit a problem: {uploadError} Use the controls
          below to fix the materials and start generation.
        </p>
      ) : null}
      {failedMaterials.length > 0 ? (
        <p className="state state-error">
          Some materials could not be read, so generation can't use them:{' '}
          {failedMaterials
            .map((m) => `${m.file_name} — ${m.extract_error ?? 'unreadable'}`)
            .join('; ')}{' '}
          Remove or replace it under “Source materials” below, then regenerate.
        </p>
      ) : null}
      {course.status === 'pending' ? (
        isOwner ? (
          <p className="state state-empty">
            Generation hasn't started for this course. {startButton}
          </p>
        ) : (
          <p className="state state-empty">
            This course hasn't been generated yet.
          </p>
        )
      ) : null}
      {course.status === 'processing' ? (
        stalled ? (
          <p className="state state-error">
            Generation is taking unusually long — the run may have crashed.
            {isOwner ? (
              <> A retry becomes possible a few minutes in. {startButton}</>
            ) : null}
          </p>
        ) : (
          <p className="state state-loading">
            Generation in progress — chapters and lessons appear here when the
            AI finishes scanning your materials. This page refreshes itself.
          </p>
        )
      ) : null}
      {course.status === 'ready' &&
      chapters.some((c) => c.nodes.some((n) => n.question_count < 5))
        ? (() => {
            const totalLessons = chapters.reduce(
              (s, c) => s + c.nodes.length,
              0,
            )
            const incompleteLessons = chapters.reduce(
              (s, c) => s + c.nodes.filter((n) => n.question_count < 5).length,
              0,
            )
            return (
              <p className="state state-error">
                {incompleteLessons} of {totalLessons} lessons need more
                questions.
                {isOwner ? (
                  <>
                    {' '}
                    Tap to fill them — only the incomplete lessons are
                    regenerated, your other lessons and progress are preserved.{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleStartGeneration}
                    >
                      Fill incomplete lessons
                    </button>
                  </>
                ) : null}
              </p>
            )
          })()
        : null}
      {course.status === 'failed' ? (
        <p className="state state-error">
          Generation failed
          {/* The raw failure reason can quote provider errors; owner-only. */}
          {isOwner && course.generation_error
            ? `: ${course.generation_error}`
            : '.'}{' '}
          {isOwner ? startButton : null}
        </p>
      ) : null}
      {isOwner && course.status === 'ready' ? (
        <p className="course-meta">
          <button type="button" disabled={busy} onClick={handleRegenerate}>
            Regenerate course
          </button>{' '}
          Rebuilds all chapters and questions from the current materials.
        </p>
      ) : null}
      {isOwner ? (
        <OwnerCourseControls
          course={course}
          materials={materials}
          busy={busy}
          onVisibility={handleVisibility}
          onRename={handleRename}
          onDelete={handleDelete}
          onMaterialsChanged={state.reload}
        />
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
      {session && course.status === 'ready' ? (
        <section>
          <h2>Your mock tests</h2>
          <MockTestList
            tests={mockTests}
            busy={busy}
            onRename={isOwner ? handleRenameTest : undefined}
            onDelete={isOwner ? handleDeleteTest : undefined}
          />
        </section>
      ) : null}
    </div>
  )
}

export default CoursePage
