import { act, renderHook, waitFor } from '@testing-library/react'
// @vitest-environment happy-dom
import { describe, expect, test, vi } from 'vitest'
import { useAsync } from './useAsync'

describe('useAsync', () => {
  test('starts loading, then resolves with data', async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.resolve('hi'), []),
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBe('hi')
    expect(result.current.error).toBeNull()
  })

  test('captures a thrown Error message in error state', async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.reject(new Error('boom')), []),
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.data).toBeNull()
  })

  test('falls back to a generic message for a non-Error rejection', async () => {
    const { result } = renderHook(() =>
      useAsync(() => Promise.reject('nope'), []),
    )

    await waitFor(() => expect(result.current.error).toBe('Something broke.'))
  })

  test('reload() re-runs the fetcher', async () => {
    const fetcher = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)

    const { result } = renderHook(() => useAsync(fetcher, []))
    await waitFor(() => expect(result.current.data).toBe(1))

    act(() => result.current.reload())
    await waitFor(() => expect(result.current.data).toBe(2))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test('re-fetches when deps change', async () => {
    const fetcher = vi.fn((id: number) => Promise.resolve(`item-${id}`))
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) => useAsync(() => fetcher(id), [id]),
      { initialProps: { id: 1 } },
    )

    await waitFor(() => expect(result.current.data).toBe('item-1'))
    rerender({ id: 2 })
    await waitFor(() => expect(result.current.data).toBe('item-2'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
