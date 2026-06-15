import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { MockTest } from '../../types/database'

interface MockTestListProps {
  tests: MockTest[]
  busy?: boolean
  // Owner-only actions; when omitted the list is read-only.
  onRename?: (id: string, title: string) => void
  onDelete?: (id: string) => void
}

// The user's existing mock tests for one course (most recent first). The owner
// gets inline rename + delete; visitors see a plain list.
function MockTestList({ tests, busy, onRename, onDelete }: MockTestListProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  if (tests.length === 0) {
    return (
      <p className="state state-empty">
        No mock tests yet — create one from this course's chapters.
      </p>
    )
  }

  function startEdit(test: MockTest) {
    setEditingId(test.id)
    setDraft(test.title)
  }

  function commitEdit(id: string) {
    if (onRename && draft.trim().length > 0) onRename(id, draft)
    setEditingId(null)
  }

  return (
    <ul className="mock-test-list">
      {tests.map((test) => (
        <li key={test.id}>
          {editingId === test.id ? (
            <>
              <input
                type="text"
                value={draft}
                disabled={busy}
                aria-label="Mock test title"
                onChange={(event) => setDraft(event.target.value)}
              />{' '}
              <button
                type="button"
                disabled={busy || draft.trim().length === 0}
                onClick={() => commitEdit(test.id)}
              >
                Save
              </button>{' '}
              <button type="button" onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <Link to={`/mock-tests/${test.id}`}>{test.title}</Link>{' '}
              <span className="course-meta">
                {test.question_count} questions · {test.chapter_ids.length}{' '}
                chapter{test.chapter_ids.length === 1 ? '' : 's'}
              </span>
              {onRename ? (
                <>
                  {' '}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => startEdit(test)}
                  >
                    Rename
                  </button>
                </>
              ) : null}
              {onDelete ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy}
                    onClick={() => onDelete(test.id)}
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

export default MockTestList
