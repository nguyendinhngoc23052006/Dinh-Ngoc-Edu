import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Unmount anything a component test rendered, so a leftover DOM node can never
// leak into the next test. cleanup() is a no-op when nothing was mounted, so
// this is harmless for the node-environment service/lib suites that also load
// this setup file.
afterEach(() => {
  cleanup()
})
