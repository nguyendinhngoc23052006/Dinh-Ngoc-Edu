import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn, signUp } from '../../services/authService'

interface LoginFormProps {
  onSuccess: () => void
}

function LoginForm({ onSuccess }: LoginFormProps) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
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

  return (
    <form className="card form auth-card" onSubmit={handleSubmit}>
      <h2>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error ? <p className="state state-error">{error}</p> : null}
      {notice ? <p className="state state-empty">{notice}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'sign-in' ? 'Log in' : 'Sign up'}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setNotice(null)
          setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
        }}
      >
        {mode === 'sign-in'
          ? 'New here? Create an account'
          : 'Already registered? Log in'}
      </button>
    </form>
  )
}

export default LoginForm
