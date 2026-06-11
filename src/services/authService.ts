import { supabase } from '../lib/supabaseClient'
import type { Session } from '@supabase/supabase-js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

// Returns a human-readable problem, or null when the credentials are usable.
export function validateCredentials(
  email: string,
  password: string,
): string | null {
  if (!EMAIL_PATTERN.test(email.trim())) {
    return 'Enter a valid email address.'
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

// Returns true when the project requires email confirmation (no session yet),
// so the form can say "check your inbox" instead of bouncing off RequireAuth.
export async function signUp(
  email: string,
  password: string,
): Promise<boolean> {
  const problem = validateCredentials(email, password)
  if (problem) throw new Error(problem)
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // Without this, the confirmation link falls back to the project's Site
    // URL (the localhost default on a fresh project) — a blank page.
    options: { emailRedirectTo: `${window.location.origin}/dashboard` },
  })
  if (error) throw new Error(error.message)
  return data.session === null
}

// Google OAuth: no confirmation email, so it dodges the project-wide email
// rate limit entirely. The browser leaves the app and comes back to returnTo.
export async function signInWithGoogle(returnTo = '/dashboard'): Promise<void> {
  // Only a same-origin path may ride the redirect: anything not starting
  // with a single '/' could rewrite the host (open-redirect phishing).
  const path =
    returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? returnTo
      : '/dashboard'
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}${path}` },
  })
  if (error) throw new Error(error.message)
}

export async function signIn(email: string, password: string): Promise<void> {
  const problem = validateCredentials(email, password)
  if (problem) throw new Error(problem)
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)
  return data.session
}

// Subscribes to auth changes; returns the unsubscribe function.
export function onAuthChange(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}

export async function requireUserId(): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error('You must be logged in.')
  return session.user.id
}
