import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { getCourseContent } from '../services/lessonService'
import {
  createMockTest,
  validateNewMockTest,
} from '../services/mockTestService'
import ChapterPicker from '../components/mock-tests/ChapterPicker'

function NewMockTestPage() {
  const { courseId = '' } = useParams()
  const navigate = useNavigate()
  const state = useAsync(() => getCourseContent(courseId), [courseId])
  const [title, setTitle] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function toggleChapter(chapterId: string) {
    setSelectedIds((current) =>
      current.includes(chapterId)
        ? current.filter((id) => id !== chapterId)
        : [...current, chapterId],
    )
  }

  async function handleCreate() {
    const problem = validateNewMockTest(title, selectedIds)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setBusy(true)
    try {
      const test = await createMockTest(courseId, title, selectedIds)
      navigate(`/mock-tests/${test.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Creation failed.')
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>New mock test</h1>
      <p>Choose which chapters the test should draw questions from.</p>
      {state.loading ? (
        <p className="state state-loading">Loading chapters…</p>
      ) : state.error ? (
        <p className="state state-error">
          {state.error}{' '}
          <button type="button" onClick={state.reload}>
            Retry
          </button>
        </p>
      ) : (
        <div className="card form">
          <label>
            Test title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Final exam dry run"
            />
          </label>
          <ChapterPicker
            chapters={state.data ?? []}
            selectedIds={selectedIds}
            onToggle={toggleChapter}
          />
          {error ? <p className="state state-error">{error}</p> : null}
          <button type="button" disabled={busy} onClick={handleCreate}>
            {busy ? 'Creating…' : 'Create mock test'}
          </button>
        </div>
      )}
    </section>
  )
}

export default NewMockTestPage
