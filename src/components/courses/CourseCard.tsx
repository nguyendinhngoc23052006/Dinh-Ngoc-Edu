import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Course } from '../../types/database'
import type { CourseProgress } from '../../services/progressService'
import { statusLabel, visibilityLabel } from '../../lib/courseLabels'

interface CourseCardProps {
  course: Course
  progress?: CourseProgress
  action?: ReactNode
  // The author's public display name, when known (shown on Explore).
  authorName?: string
}

function CourseCard({ course, progress, action, authorName }: CourseCardProps) {
  return (
    <article className="card course-card">
      <h3>
        <Link to={`/courses/${course.id}`}>{course.title}</Link>
      </h3>
      {authorName ? <p className="course-author">by {authorName}</p> : null}
      <p className="course-meta">
        {course.output_language} · {statusLabel(course.status)} ·{' '}
        {visibilityLabel(course.visibility)}
      </p>
      {progress && progress.total > 0 ? (
        <p className="course-progress">
          <progress value={progress.completed} max={progress.total} />{' '}
          {progress.completed} / {progress.total} lessons
        </p>
      ) : null}
      {action}
    </article>
  )
}

export default CourseCard
