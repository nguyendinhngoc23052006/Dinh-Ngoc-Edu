import { useNavigate } from 'react-router-dom'
import UploadForm from '../components/courses/UploadForm'
import { createCourse } from '../services/courseService'
import { uploadMaterial } from '../services/materialService'

function NewCoursePage() {
  const navigate = useNavigate()

  async function handleSubmit(input: {
    title: string
    outputLanguage: string
    files: File[]
  }) {
    const course = await createCourse(input.title, input.outputLanguage)
    for (const file of input.files) {
      await uploadMaterial(course.id, file)
    }
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
      <UploadForm onSubmit={handleSubmit} />
    </section>
  )
}

export default NewCoursePage
