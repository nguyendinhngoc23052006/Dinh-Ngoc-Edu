import { useState } from 'react'
import type { FormEvent } from 'react'
import ConfirmDialog from '../ui/ConfirmDialog'

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
  const [confirmOpen, setConfirmOpen] = useState(false)

  function handleRename(event: FormEvent) {
    event.preventDefault()
    onRename(draft)
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
        onClick={() => setConfirmOpen(true)}
      >
        Delete course
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete this course?"
        message="Its lessons, questions, progress, and mock tests go with it. This cannot be undone."
        confirmLabel="Delete"
        busy={busy}
        onConfirm={() => {
          setConfirmOpen(false)
          onDelete()
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </details>
  )
}

export default CourseSettings
