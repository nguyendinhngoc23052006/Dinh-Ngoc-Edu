import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest'

const resetPasswordForEmail = vi.fn()
const updateUser = vi.fn()
const invoke = vi.fn()
const signOut = vi.fn()

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) =>
        resetPasswordForEmail(...args),
      updateUser: (...args: unknown[]) => updateUser(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
    functions: {
      invoke: (...args: unknown[]) => invoke(...args),
    },
  },
}))

// The service builds redirectTo from window.location.origin; the node test env
// has no window, so give it one.
vi.stubGlobal('window', { location: { origin: 'https://app.test' } })
afterAll(() => vi.unstubAllGlobals())

import {
  confirmsDeletion,
  deleteAccount,
  requestPasswordReset,
  updatePassword,
  validateCredentials,
} from './authService'

beforeEach(() => {
  resetPasswordForEmail.mockReset().mockResolvedValue({ error: null })
  updateUser.mockReset().mockResolvedValue({ error: null })
  invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null })
  signOut.mockReset().mockResolvedValue({ error: null })
})

describe('validateCredentials', () => {
  test('accepts a valid email and long-enough password', () => {
    expect(validateCredentials('a@b.com', 'password123')).toBeNull()
  })
  test('rejects a malformed email', () => {
    expect(validateCredentials('not-an-email', 'password123')).toMatch(/email/i)
  })
  test('rejects a too-short password', () => {
    expect(validateCredentials('a@b.com', 'short')).toMatch(/8 characters/)
  })
})

describe('requestPasswordReset', () => {
  test('emails the reset link with a /reset redirect', async () => {
    await requestPasswordReset('  user@example.com ')
    expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://app.test/reset',
    })
  })

  test('rejects a malformed email without calling the API', async () => {
    await expect(requestPasswordReset('nope')).rejects.toThrow(/email/i)
    expect(resetPasswordForEmail).not.toHaveBeenCalled()
  })

  test('maps the shared mailer rate-limit to a clear message', async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: { code: 'over_email_send_rate_limit', message: 'raw' },
    })
    await expect(requestPasswordReset('user@example.com')).rejects.toThrow(
      /shared limit/,
    )
  })
})

describe('updatePassword', () => {
  test('rejects a too-short password without calling the API', async () => {
    await expect(updatePassword('short')).rejects.toThrow(/8 characters/)
    expect(updateUser).not.toHaveBeenCalled()
  })

  test('sets the new password in the current session', async () => {
    await updatePassword('a-good-password')
    expect(updateUser).toHaveBeenCalledWith({ password: 'a-good-password' })
  })

  test('passes a Supabase error through', async () => {
    updateUser.mockResolvedValue({ error: { message: 'Auth session missing!' } })
    await expect(updatePassword('a-good-password')).rejects.toThrow(
      /session missing/,
    )
  })
})

describe('confirmsDeletion', () => {
  test('accepts the exact word (trimmed)', () => {
    expect(confirmsDeletion('  DELETE  ')).toBe(true)
  })
  test('rejects anything else, case-sensitively', () => {
    expect(confirmsDeletion('delete')).toBe(false)
    expect(confirmsDeletion('')).toBe(false)
  })
})

describe('deleteAccount', () => {
  test('invokes the delete-account function then signs out', async () => {
    await deleteAccount()
    expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' })
    expect(signOut).toHaveBeenCalled()
  })

  test('throws and does not sign out when the function errors', async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(deleteAccount()).rejects.toThrow(/boom/)
    expect(signOut).not.toHaveBeenCalled()
  })
})
