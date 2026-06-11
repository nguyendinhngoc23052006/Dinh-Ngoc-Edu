import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn, signInWithGoogle, signUp } from '../../services/authService'

interface LoginFormProps {
  onSuccess: () => void
  // Path to land on after the Google round trip (the OAuth redirect leaves
  // the app, so onSuccess never runs for it).
  returnTo?: string
}

function LoginForm({ onSuccess, returnTo }: LoginFormProps) {
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

  async function handleGoogle() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle(returnTo)
      // The browser navigates away to Google; nothing more to do here.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login failed.')
      setBusy(false)
    }
  }

  return (
    <form className="card form auth-card" onSubmit={handleSubmit}>
      <h2>{mode === 'sign-in' ? 'Welcome back' : 'Create your account'}</h2>
      <button
        type="button"
        className="google-button"
        disabled={busy}
        onClick={() => void handleGoogle()}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.29 14.29A7.2 7.2 0 0 1 4.91 12c0-.8.14-1.57.38-2.29v-3.1H1.29a12 12 0 0 0 0 10.78l4-3.1z"
          />
          <path
            fill="#EA4335"
            d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.61l4 3.1C6.23 6.87 8.88 4.76 12 4.76z"
          />
        </svg>
        Continue with Google
      </button>
      <p className="auth-divider">or use email</p>
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
