import { useState } from 'react'
import type { FormEvent } from 'react'

interface CourseSettingsProps {
  title: string
  busy: boolean
  onRename: (title: string) => void
  onDelete: () => void
}

// Owner-only course settings: rename and delete. The page owns the service
// calls; this only renders the controls.
function CourseSettings({
  title,
  busy,
  onRename,
  onDelete,
}: CourseSettingsProps) {
  const [draft, setDraft] = useState(title)

  function handleRename(event: FormEvent) {
    event.preventDefault()
    onRename(draft)
  }

  function handleDelete() {
    if (
      window.confirm(
        'Delete this course? Its lessons, questions, progress, and mock tests go with it.',
      )
    ) {
      onDelete()
    }
  }

  return (
    <details className="course-settings">
      <summary>Course settings</summary>
      <form className="settings-row" onSubmit={handleRename}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Course title"
        />
        <button type="submit" disabled={busy || draft.trim() === title}>
          Rename
        </button>
      </form>
      <button
        type="button"
        className="danger"
        disabled={busy}
        onClick={handleDelete}
      >
        Delete course
      </button>
    </details>
  )
}

export default CourseSettings
