import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { confirmsDeletion, deleteAccount } from '../../services/authService'

// Irreversible: permanently deletes the signed-in account once the user types
// the confirmation word. Self-contained (its own state) so SettingsPage stays
// small and the destructive path is isolated.
function DeleteAccountCard() {
  const navigate = useNavigate()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function removeAccount() {
    if (!confirmsDeletion(confirmText)) return
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount()
      navigate('/')
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete your account.',
      )
      setDeleting(false)
    }
  }

  return (
    <div className="card danger-zone">
      <h2>Delete account</h2>
      <p>
        This permanently deletes your account and everything in it — your
        courses, mock tests, progress, and saved courses. It cannot be undone.
      </p>
      {error ? <p className="state state-error">{error}</p> : null}
      <label className="setting-row">
        <span>
          Type <strong>DELETE</strong> to confirm.
        </span>
        <input
          type="text"
          value={confirmText}
          disabled={deleting}
          placeholder="DELETE"
          onChange={(event) => setConfirmText(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="danger"
        disabled={deleting || !confirmsDeletion(confirmText)}
        onClick={removeAccount}
      >
        {deleting ? 'Deleting…' : 'Delete my account'}
      </button>
    </div>
  )
}

export default DeleteAccountCard
