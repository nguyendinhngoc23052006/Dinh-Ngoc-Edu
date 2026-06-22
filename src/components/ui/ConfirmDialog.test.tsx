import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import ConfirmDialog from './ConfirmDialog'

const base = {
  title: 'Release pet?',
  message: 'This cannot be undone.',
  onConfirm: () => {},
  onCancel: () => {},
}

describe('ConfirmDialog', () => {
  test('renders nothing while closed', () => {
    const { container } = render(<ConfirmDialog open={false} {...base} />)
    expect(container.firstChild).toBeNull()
  })

  test('fires onConfirm when the confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog
        open
        {...base}
        confirmLabel="Release"
        onConfirm={onConfirm}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Release' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  test('Escape, backdrop click, and card click', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open {...base} onCancel={onCancel} />)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)

    // Clicking the card itself must NOT cancel — it stops propagation.
    await userEvent.click(screen.getByRole('alertdialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)

    // Clicking the backdrop (the overlay around the card) cancels.
    await userEvent.click(
      document.querySelector('.modal-overlay') as HTMLElement,
    )
    expect(onCancel).toHaveBeenCalledTimes(2)
  })

  test('busy disables both buttons and blocks Escape', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog open busy {...base} onCancel={onCancel} />)

    expect(
      (screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Working…' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    await userEvent.keyboard('{Escape}')
    expect(onCancel).not.toHaveBeenCalled()
  })
})
