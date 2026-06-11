import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { listMyCourses } from '../services/courseService'
import { listSavedCourses } from '../services/savedCourseService'
import { getCourseProgress } from '../services/progressService'
import type { CourseProgress } from '../services/progressService'
import CourseCard from '../components/courses/CourseCard'
import type { Course } from '../types/database'

interface CourseList {
  courses: Course[]
  progress: Map<string, CourseProgress>
}

async function listWithProgress(
  list: () => Promise<Course[]>,
): Promise<CourseList> {
  const courses = await list()
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
}

function CourseSection({
  title,
  data,
  loading,
  error,
  reload,
  emptyText,
}: CourseSectionProps) {
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
      ) : !data || data.courses.length === 0 ? (
        <p className="state state-empty">{emptyText}</p>
      ) : (
        <div className="card-grid">
          {data.courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              progress={data.progress.get(course.id)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function DashboardPage() {
  const mine = useAsync(() => listWithProgress(listMyCourses), [])
  const saved = useAsync(() => listWithProgress(listSavedCourses), [])

  return (
    <div>
      <div className="page-header">
        <h1>Your courses</h1>
        <Link className="cta" to="/courses/new">
          New course
        </Link>
      </div>
      <CourseSection
        title="Created by you"
        data={mine.data}
        loading={mine.loading}
        error={mine.error}
        reload={mine.reload}
        emptyText="No courses yet — upload materials to generate your first one."
      />
      <CourseSection
        title="Saved from Explore"
        data={saved.data}
        loading={saved.loading}
        error={saved.error}
        reload={saved.reload}
        emptyText="Nothing saved yet — find public courses on Explore."
      />
    </div>
  )
}

export default DashboardPage
