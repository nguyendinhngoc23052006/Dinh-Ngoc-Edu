import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { updatePassword } from '../services/authService'

// Where a password-reset email link lands. Supabase establishes a recovery
// session from the link (detectSessionInUrl), so the user is signed in just
// long enough to choose a new password; on success they continue to the app.
function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      navigate('/dashboard', { replace: true })
    } catch (cause) {
      // Most often the link expired or was already used, which leaves no
      // recovery session for updateUser to act on.
      setError(
        cause instanceof Error
          ? `${cause.message} The reset link may have expired — request a new one from the login page.`
          : 'Could not update your password.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <form className="card form auth-card" onSubmit={handleSubmit}>
        <h2>Choose a new password</h2>
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        {error ? <p className="state state-error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </section>
  )
}

export default ResetPasswordPage
