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

export async function signUp(email: string, password: string): Promise<void> {
  const problem = validateCredentials(email, password)
  if (problem) throw new Error(problem)
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
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
