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
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">Last Minute</span>
          <h1>Turn your notes into a game you can win.</h1>
          <p>
            Upload your materials, pick a language, and get a Duolingo-style
            course back — chapters, bite-size lessons, and questions graded
            against your own notes. Ace a lesson, earn credits, and spend them
            on themes and a study pet.
          </p>
          <ul className="hero-points">
            <li>🎯 Difficulty set by your material, not guessed</li>
            <li>🧮 Calculation drills with fresh numbers every time</li>
            <li>⭐ Earn credits for flawless lessons</li>
            <li>🎨 Themes &amp; 🐉 pets to make studying yours</li>
          </ul>
        </div>
        <div className="hero-card card">
          <h2>Start in 30 seconds</h2>
          <UploadForm onSubmit={handleSubmit} />
          <p className="course-meta">
            Not logged in? We'll ask after you hit Generate — your selection
            carries over.
          </p>
        </div>
      </div>
      <ol className="landing-steps">
        <li>
          <span>1</span> Upload notes, slides, or readings.
        </li>
        <li>
          <span>2</span> Pick the language you'll study in.
        </li>
        <li>
          <span>3</span> Learn chapter by chapter, lesson by lesson.
        </li>
        <li>
          <span>4</span> Build mock tests from any chapters.
        </li>
      </ol>
    </section>
  )
}

export default LandingPage
