import { describe, expect, test } from 'vitest'
import { petFormFilter, petFormScale, petSpriteUrl } from './petSprite'

describe('petSpriteUrl', () => {
  test('resolves the sprite by species id, by convention', () => {
    expect(petSpriteUrl('spc-fox')).toBe('/pets/spc-fox.png')
  })
})

describe('petFormScale', () => {
  test('grows with each evolution form', () => {
    expect(petFormScale(1)).toBe(1)
    expect(petFormScale(2)).toBeGreaterThan(petFormScale(1))
    expect(petFormScale(3)).toBeGreaterThan(petFormScale(2))
  })
})

describe('petFormFilter', () => {
  test('form 1 is the plain sprite, later forms add a filter', () => {
    expect(petFormFilter(1)).toBe('none')
    expect(petFormFilter(2)).not.toBe('none')
    expect(petFormFilter(3)).toContain('drop-shadow')
  })
})
