import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  requestPasswordReset,
  signIn,
  signUp,
} from '../../services/authService'

interface LoginFormProps {
  onSuccess: () => void
}

type Mode = 'sign-in' | 'sign-up' | 'forgot'

function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function switchMode(next: Mode) {
    setError(null)
    setNotice(null)
    setMode(next)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'forgot') {
        await requestPasswordReset(email)
        setNotice(
          'If an account exists for that email, we just sent a reset link. Open it to choose a new password.',
        )
        return
      }
      if (mode === 'sign-in') {
        await signIn(email, password)
      } else {
        const needsConfirmation = await signUp(email, password)
        if (needsConfirmation) {
          setNotice(
            'Almost there — we sent you a confirmation email. Click the link inside, and you will land here logged in.',
          )
          return
        }
      }
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  const title =
    mode === 'sign-in'
      ? 'Welcome back'
      : mode === 'sign-up'
        ? 'Create your account'
        : 'Reset your password'
  const submitLabel =
    mode === 'sign-in'
      ? 'Log in'
      : mode === 'sign-up'
        ? 'Sign up'
        : 'Send reset link'

  return (
    <form className="card form auth-card" onSubmit={handleSubmit}>
      <h2>{title}</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      {mode === 'forgot' ? null : (
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
      )}
      {error ? <p className="state state-error">{error}</p> : null}
      {notice ? <p className="state state-empty">{notice}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : submitLabel}
      </button>
      {mode === 'sign-in' ? (
        <button
          type="button"
          className="link-button"
          onClick={() => switchMode('forgot')}
        >
          Forgot your password?
        </button>
      ) : null}
      <button
        type="button"
        className="link-button"
        onClick={() => switchMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
      >
        {mode === 'sign-in'
          ? 'New here? Create an account'
          : mode === 'sign-up'
            ? 'Already registered? Log in'
            : 'Back to log in'}
      </button>
    </form>
  )
}

export default LoginForm
