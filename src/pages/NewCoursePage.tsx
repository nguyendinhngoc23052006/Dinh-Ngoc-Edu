import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadForm from '../components/courses/UploadForm'
import type { UploadInput } from '../components/courses/UploadForm'
import { createCourse } from '../services/courseService'
import { uploadMaterial } from '../services/materialService'
import { startGeneration } from '../services/generationService'
import { clearPendingCourse, getPendingCourse } from '../lib/pendingCourse'

function NewCoursePage() {
  const navigate = useNavigate()
  // A guest's stashed landing-page form, if they just came through login.
  // Peeked (not consumed) so StrictMode's double render can't lose it; it is
  // cleared once the course actually exists.
  const [initial] = useState(() => getPendingCourse())

  async function handleSubmit(input: UploadInput) {
    const course = await createCourse(input.title, input.outputLanguage)
    clearPendingCourse()
    for (const file of input.files) {
      await uploadMaterial(course.id, file)
    }
    await startGeneration(course.id)
    navigate(`/courses/${course.id}`)
  }

  return (
    <section>
      <h1>New course</h1>
      <p>
        Upload the subject's materials once. The AI scans them, splits the
        subject into chapters and lessons, and writes questions verified against
        what you uploaded.
      </p>
      {initial ? (
        <p className="state state-loading">
          Picking up where you left off — your selection from the landing page
          is filled in below. Hit Generate to continue.
        </p>
      ) : null}
      <UploadForm onSubmit={handleSubmit} initial={initial ?? undefined} />
    </section>
  )
}

export default NewCoursePage
