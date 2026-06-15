import type { Course, CourseMaterial, Visibility } from '../../types/database'
import CourseSettings from './CourseSettings'
import MaterialsManager from './MaterialsManager'
import VisibilityToggle from './VisibilityToggle'

interface OwnerCourseControlsProps {
  course: Course
  materials: CourseMaterial[]
  busy: boolean
  onVisibility: (next: Visibility) => void
  onRename: (title: string) => void
  onDelete: () => void
  onMaterialsChanged: () => void
  onRegenerate: () => void
}

// The owner-only management block for a course: visibility, rename/delete,
// source materials, and regeneration. Grouped here so CoursePage stays focused
// on loading + status.
function OwnerCourseControls({
  course,
  materials,
  busy,
  onVisibility,
  onRename,
  onDelete,
  onMaterialsChanged,
  onRegenerate,
}: OwnerCourseControlsProps) {
  return (
    <>
      <VisibilityToggle
        visibility={course.visibility}
        busy={busy}
        onChange={onVisibility}
      />
      <CourseSettings
        title={course.title}
        busy={busy}
        onRename={onRename}
        onDelete={onDelete}
      />
      <MaterialsManager
        courseId={course.id}
        materials={materials}
        onChanged={onMaterialsChanged}
      />
      {course.status === 'ready' ? (
        <p className="state state-empty">
          Changed the materials? Regenerating rebuilds the whole course
          (chapters, questions, and lesson progress) from the current files.{' '}
          <button type="button" disabled={busy} onClick={onRegenerate}>
            Regenerate course
          </button>
        </p>
      ) : null}
    </>
  )
}

export default OwnerCourseControls
