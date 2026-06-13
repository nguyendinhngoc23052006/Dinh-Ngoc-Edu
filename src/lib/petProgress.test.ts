import { describe, expect, test } from 'vitest'
import {
  EGG_HATCH_XP,
  FORM2_XP,
  FORM3_XP,
  eggReady,
  petForm,
  petProgress,
} from './petProgress'

describe('eggReady', () => {
  test('is false below the hatch threshold', () => {
    expect(eggReady(0)).toBe(false)
    expect(eggReady(EGG_HATCH_XP - 1)).toBe(false)
  })

  test('is true at and above the hatch threshold', () => {
    expect(eggReady(EGG_HATCH_XP)).toBe(true)
    expect(eggReady(EGG_HATCH_XP + 50)).toBe(true)
  })
})

describe('petForm', () => {
  test('form 1 below the second threshold', () => {
    expect(petForm(0)).toBe(1)
    expect(petForm(FORM2_XP - 1)).toBe(1)
  })

  test('form 2 between the second and third thresholds', () => {
    expect(petForm(FORM2_XP)).toBe(2)
    expect(petForm(FORM3_XP - 1)).toBe(2)
  })

  test('form 3 at and above the third threshold', () => {
    expect(petForm(FORM3_XP)).toBe(3)
    expect(petForm(FORM3_XP + 1000)).toBe(3)
  })
})

describe('petProgress', () => {
  test('an egg fills toward hatching', () => {
    expect(petProgress('egg', 40)).toEqual({
      toward: 'hatch',
      have: 40,
      need: EGG_HATCH_XP,
      atMax: false,
    })
  })

  test('a form-1 pet fills toward form 2 from the hatch threshold', () => {
    expect(petProgress('hatched', EGG_HATCH_XP)).toEqual({
      toward: 'form2',
      have: 0,
      need: FORM2_XP - EGG_HATCH_XP,
      atMax: false,
    })
  })

  test('a form-2 pet fills toward form 3', () => {
    expect(petProgress('hatched', FORM2_XP)).toEqual({
      toward: 'form3',
      have: 0,
      need: FORM3_XP - FORM2_XP,
      atMax: false,
    })
  })

  test('a fully evolved pet is at max', () => {
    expect(petProgress('hatched', FORM3_XP)).toEqual({
      toward: 'max',
      have: 0,
      need: 0,
      atMax: true,
    })
  })
})
