import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { Course } from '../../types/database'

interface CourseCardProps {
  course: Course
  action?: ReactNode
}

function CourseCard({ course, action }: CourseCardProps) {
  return (
    <article className="card course-card">
      <h3>
        <Link to={`/courses/${course.id}`}>{course.title}</Link>
      </h3>
      <p className="course-meta">
        {course.output_language} · {course.status} · {course.visibility}
      </p>
      {action}
    </article>
  )
}

export default CourseCard
