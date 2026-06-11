// Chainable stand-in for the Supabase client used by service unit tests.
// Every property access / method call returns the same kind of proxy, and
// each `await` of a chain consumes the next queued result — so a test queues
// one result per round trip the service makes, in order.

export interface RecordedCall {
  path: string
  args: unknown[]
}

interface MockState {
  queue: Array<Record<string, unknown>>
  cursor: number
  calls: RecordedCall[]
}

const state: MockState = { queue: [], cursor: 0, calls: [] }

function makeProxy(path: string): unknown {
  const target = () => undefined
  return new Proxy(target, {
    get(_target, prop) {
      if (prop === 'then') {
        const result = state.queue[state.cursor] ?? { data: null, error: null }
        state.cursor += 1
        const promise = Promise.resolve(result)
        return promise.then.bind(promise)
      }
      return makeProxy(path ? `${path}.${String(prop)}` : String(prop))
    },
    apply(_target, _thisArg, args) {
      state.calls.push({ path, args })
      return makeProxy(path)
    },
  })
}

export const supabaseMock = {
  client: makeProxy(''),
  reset(queue: Array<Record<string, unknown>>) {
    state.queue = queue
    state.cursor = 0
    state.calls = []
  },
  get calls(): RecordedCall[] {
    return state.calls
  },
}

// A queued auth.getSession() success for the given user id.
export function sessionResult(userId: string): Record<string, unknown> {
  return { data: { session: { user: { id: userId } } }, error: null }
}
