import { useNavigate } from 'react-router-dom'
import UploadForm from '../components/courses/UploadForm'
import type { UploadInput } from '../components/courses/UploadForm'
import { setPendingCourse } from '../lib/pendingCourse'

// Public teaser: the upload form works before logging in. Submitting stashes
// the filled-in form and heads for /courses/new — RequireAuth bounces guests
// through login first, and the stash means nothing has to be re-uploaded.
function LandingPage() {
  const navigate = useNavigate()

  async function handleSubmit(input: UploadInput) {
    setPendingCourse(input)
    navigate('/courses/new')
  }

  return (
    <section className="landing">
      <h1>Cram smarter, not longer.</h1>
      <p>
        Upload your subject's materials once, pick a language, and get a
        Duolingo-style course back: chapters, bite-size lessons, and questions
        verified against your own notes. When you're ready, build mock tests
        from the chapters you choose.
      </p>
      <ol className="landing-steps">
        <li>Upload your lecture notes, slides, or readings.</li>
        <li>Choose the language you want to study in.</li>
        <li>Learn chapter by chapter, node by node.</li>
        <li>Generate mock tests from any chapters you pick.</li>
      </ol>
      <UploadForm onSubmit={handleSubmit} />
      <p className="course-meta">
        Not logged in yet? No problem — we'll ask you to log in after you hit
        Generate, and your selection carries over.
      </p>
    </section>
  )
}

export default LandingPage
