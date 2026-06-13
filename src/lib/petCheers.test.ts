import { describe, expect, test } from 'vitest'
import { PET_CHEERS, pickCheer } from './petCheers'

describe('pickCheer', () => {
  test('always returns a cheer from the list', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(PET_CHEERS).toContain(pickCheer())
    }
  })

  test('never returns the excluded (just-shown) cheer', () => {
    const exclude = PET_CHEERS[0]
    for (let i = 0; i < 50; i += 1) {
      expect(pickCheer(exclude)).not.toBe(exclude)
    }
  })

  test('falls back to the full list if the exclusion is unknown', () => {
    expect(PET_CHEERS).toContain(pickCheer('not a real cheer'))
  })
})
