import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAsync } from '../hooks/useAsync'
import { listMyCourses, PAGE_SIZE } from '../services/courseService'
import { listSavedCourses, unsaveCourse } from '../services/savedCourseService'
import { getCourseProgress } from '../services/progressService'
import type { CourseProgress } from '../services/progressService'
import CourseCard from '../components/courses/CourseCard'
import type { Course } from '../types/database'

interface CourseList {
  courses: Course[]
  progress: Map<string, CourseProgress>
}

async function listWithProgress(courses: Course[]): Promise<CourseList> {
  const progress = await getCourseProgress(courses.map((c) => c.id))
  return { courses, progress }
}

interface CourseSectionProps {
  title: string
  data: CourseList | null
  loading: boolean
  error: string | null
  reload: () => void
  emptyText: string
  page: number
  onPage: (page: number) => void
  action?: (course: Course) => ReactNode
}

function CourseSection({
  title,
  data,
  loading,
  error,
  reload,
  emptyText,
  page,
  onPage,
  action,
}: CourseSectionProps) {
  const courses = data?.courses ?? []
  return (
    <section>
      <h2>{title}</h2>
      {loading ? (
        <p className="state state-loading">Loading courses…</p>
      ) : error ? (
        <p className="state state-error">
          {error}{' '}
          <button type="button" onClick={reload}>
            Retry
          </button>
        </p>
      ) : courses.length === 0 ? (
        <p className="state state-empty">
          {page === 0 ? emptyText : 'No more courses.'}
        </p>
      ) : (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              progress={data?.progress.get(course.id)}
              action={action?.(course)}
            />
          ))}
        </div>
      )}
      {page > 0 || courses.length === PAGE_SIZE ? (
        <div className="pager">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            disabled={courses.length < PAGE_SIZE}
            onClick={() => onPage(page + 1)}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  )
}

function DashboardPage() {
  const [minePage, setMinePage] = useState(0)
  const [savedPage, setSavedPage] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const mine = useAsync(
    async () => listWithProgress(await listMyCourses(minePage)),
    [minePage],
  )
  const saved = useAsync(
    async () => listWithProgress(await listSavedCourses(savedPage)),
    [savedPage],
  )

  async function handleUnsave(courseId: string) {
    setActionError(null)
    try {
      await unsaveCourse(courseId)
      saved.reload()
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Remove failed.')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Your courses</h1>
        <Link className="cta" to="/courses/new">
          New course
        </Link>
      </div>
      {actionError ? <p className="state state-error">{actionError}</p> : null}
      <CourseSection
        title="Created by you"
        data={mine.data}
        loading={mine.loading}
        error={mine.error}
        reload={mine.reload}
        emptyText="No courses yet — upload materials to generate your first one."
        page={minePage}
        onPage={setMinePage}
      />
      <CourseSection
        title="Saved from Explore"
        data={saved.data}
        loading={saved.loading}
        error={saved.error}
        reload={saved.reload}
        emptyText="Nothing saved yet — find public courses on Explore."
        page={savedPage}
        onPage={setSavedPage}
        action={(course) => (
          <button type="button" onClick={() => void handleUnsave(course.id)}>
            Remove from saved
          </button>
        )}
      />
    </div>
  )
}

export default DashboardPage
