import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadForm from '../components/courses/UploadForm'
import type { UploadInput } from '../components/courses/UploadForm'
import { clearPendingCourse, getPendingCourse } from '../lib/pendingCourse'
import { createCourse } from '../services/courseService'
import { startGeneration } from '../services/generationService'
import { uploadMaterial } from '../services/materialService'

function NewCoursePage() {
  const navigate = useNavigate()
  // A guest's stashed landing-page form, if they just came through login.
  // Peeked (not consumed) so StrictMode's double render can't lose it; it is
  // cleared once the course actually exists.
  const [initial] = useState(() => getPendingCourse())

  async function handleSubmit(input: UploadInput) {
    // A failure here leaves nothing behind; the form shows the error.
    const course = await createCourse(input.title, input.outputLanguage)
    clearPendingCourse()
    // The shell now exists, so resubmitting would duplicate it. Instead of
    // swallowing an upload/generation failure, we carry it to the course page
    // (which has the Start-generation, materials, and Delete recovery paths) and
    // show it there.
    let uploadError: string | null = null
    try {
      for (const file of input.files) {
        await uploadMaterial(course.id, file)
      }
      await startGeneration(course.id)
    } catch (cause) {
      uploadError =
        cause instanceof Error ? cause.message : 'Upload or generation failed.'
    }
    navigate(
      `/courses/${course.id}`,
      uploadError ? { state: { uploadError } } : undefined,
    )
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
