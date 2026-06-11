import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Public preview: shows what the app does and funnels visitors to log in
// before they can actually generate a course.
function LandingPage() {
  const { session } = useAuth()

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
      {session ? (
        <Link className="cta" to="/courses/new">
          Upload a file to generate your course
        </Link>
      ) : (
        <p className="card">
          <strong>Upload a file to generate your course</strong> — you'll need
          to <Link to="/login">log in with your email</Link> first.
        </p>
      )}
    </section>
  )
}

export default LandingPage
