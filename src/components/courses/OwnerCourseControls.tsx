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
}

// The owner-only management block for a course: visibility, rename/delete, and
// source materials. Grouped here so CoursePage stays focused on loading +
// status.
function OwnerCourseControls({
  course,
  materials,
  busy,
  onVisibility,
  onRename,
  onDelete,
  onMaterialsChanged,
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
    </>
  )
}

export default OwnerCourseControls
