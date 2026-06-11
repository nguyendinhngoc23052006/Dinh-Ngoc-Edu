import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { listMyCourses } from '../services/courseService'
import { listSavedCourses } from '../services/savedCourseService'
import CourseCard from '../components/courses/CourseCard'
import type { Course } from '../types/database'

interface CourseSectionProps {
  title: string
  courses: Course[] | null
  loading: boolean
  error: string | null
  reload: () => void
  emptyText: string
}

function CourseSection({
  title,
  courses,
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
      ) : !courses || courses.length === 0 ? (
        <p className="state state-empty">{emptyText}</p>
      ) : (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  )
}

function DashboardPage() {
  const mine = useAsync(() => listMyCourses(), [])
  const saved = useAsync(() => listSavedCourses(), [])

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
        courses={mine.data}
        loading={mine.loading}
        error={mine.error}
        reload={mine.reload}
        emptyText="No courses yet — upload materials to generate your first one."
      />
      <CourseSection
        title="Saved from Explore"
        courses={saved.data}
        loading={saved.loading}
        error={saved.error}
        reload={saved.reload}
        emptyText="Nothing saved yet — find public courses on Explore."
      />
    </div>
  )
}

export default DashboardPage
