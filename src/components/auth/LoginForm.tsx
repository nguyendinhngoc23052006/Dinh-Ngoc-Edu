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
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'sign-in') {
        await signIn(email, password)
      } else {
        await signUp(email, password)
      }
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <h2>{mode === 'sign-in' ? 'Log in' : 'Create account'}</h2>
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
      <button type="submit" disabled={busy}>
        {busy ? 'Working…' : mode === 'sign-in' ? 'Log in' : 'Sign up'}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
      >
        {mode === 'sign-in'
          ? 'New here? Create an account'
          : 'Already registered? Log in'}
      </button>
    </form>
  )
}

export default LoginForm
