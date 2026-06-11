import { useEffect, useState } from 'react'

/* eslint-disable react-hooks/set-state-in-effect --
   Generic fetch-on-mount hook: loading/error must reset synchronously when
   the query deps change, before the new async result lands. */

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

// Shared fetch-on-mount state machine so every data-backed view renders the
// same loading / empty / error contract without re-implementing it.
// `fetcher` may be an inline arrow; only `deps` (+ reload) trigger a re-fetch.
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetcher()
      .then((result) => {
        if (active) setData(result)
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Something broke.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is intentionally not a dep
  }, [version, ...deps])

  function reload() {
    setVersion((v) => v + 1)
  }

  return { data, loading, error, reload }
}
