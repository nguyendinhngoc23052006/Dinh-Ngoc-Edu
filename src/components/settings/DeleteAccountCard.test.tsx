import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest'

const navigate = vi.fn()
const invoke = vi.fn()

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

// Mock the client only — the real authService (confirmsDeletion + deleteAccount)
// runs against it, so the component→service path is exercised end to end.
vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    // deleteAccount signs out after a successful delete.
    auth: { signOut: () => Promise.resolve({ error: null }) },
  },
}))

import DeleteAccountCard from './DeleteAccountCard'

function deleteButton() {
  return screen.getByRole('button', {
    name: 'Delete my account',
  }) as HTMLButtonElement
}

describe('DeleteAccountCard', () => {
  beforeEach(() => {
    navigate.mockReset()
    invoke.mockReset()
  })

  test('the delete button stays disabled until the user types DELETE exactly', async () => {
    render(<DeleteAccountCard />)
    expect(deleteButton().disabled).toBe(true)

    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'delete')
    expect(deleteButton().disabled).toBe(true)

    await userEvent.clear(screen.getByPlaceholderText('DELETE'))
    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
    expect(deleteButton().disabled).toBe(false)
  })

  test('on success it deletes then navigates home', async () => {
    invoke.mockResolvedValue({ error: null })
    render(<DeleteAccountCard />)

    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
    await userEvent.click(deleteButton())

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
    expect(invoke).toHaveBeenCalledWith('delete-account', { method: 'POST' })
  })

  test('on failure it shows the error and does not navigate away', async () => {
    invoke.mockResolvedValue({
      error: { message: 'Could not delete your account.' },
    })
    render(<DeleteAccountCard />)

    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
    await userEvent.click(deleteButton())

    expect(
      await screen.findByText('Could not delete your account.'),
    ).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
    // Re-enabled so the user can retry.
    expect(deleteButton().disabled).toBe(false)
  })
})
