import { describe, expect, test } from 'vitest'
import { DIMENSION_LABELS, dimensionLabel } from './dimensions'

describe('dimensionLabel', () => {
  test('returns the friendly label for a known token', () => {
    expect(dimensionLabel('cosmos')).toBe('Cosmos')
    expect(dimensionLabel('meadow')).toBe(DIMENSION_LABELS.meadow)
  })

  test('returns null for no token', () => {
    expect(dimensionLabel(undefined)).toBeNull()
  })

  test('returns null for an unknown token', () => {
    expect(dimensionLabel('atlantis')).toBeNull()
  })
})
