import { describe, expect, test } from 'vitest'
import {
  evaluate,
  generateInstance,
  gradeCalc,
  validateCalcSpec,
} from './calc'
import type { CalcSpec } from './calc'

describe('evaluate', () => {
  test('respects operator precedence', () => {
    expect(evaluate('2 + 3 * 4', {})).toBe(14)
  })

  test('respects parentheses', () => {
    expect(evaluate('(2 + 3) * 4', {})).toBe(20)
  })

  test('handles unary minus', () => {
    expect(evaluate('-3 + 5', {})).toBe(2)
    expect(evaluate('2 * -4', {})).toBe(-8)
  })

  test('right-associative exponent', () => {
    expect(evaluate('2 ^ 3 ^ 2', {})).toBe(512)
  })

  test('substitutes variables', () => {
    expect(evaluate('P * r * t / 100', { P: 1000, r: 5, t: 2 })).toBe(100)
  })

  test('throws on an undefined variable', () => {
    expect(() => evaluate('a + b', { a: 1 })).toThrow(/Unknown variable "b"/)
  })

  test('throws on mismatched parentheses', () => {
    expect(() => evaluate('(1 + 2', {})).toThrow(/parentheses/i)
  })

  test('throws on an unexpected character (no code execution)', () => {
    expect(() => evaluate('1 + alert(2)', {})).not.toThrow(/is not defined/)
    expect(() => evaluate('1 & 2', {})).toThrow(/Unexpected character/)
  })
})

const interestSpec: CalcSpec = {
  variables: [
    { name: 'P', min: 1000, max: 1000, decimals: 0 },
    { name: 'r', min: 5, max: 5, decimals: 0 },
    { name: 't', min: 2, max: 2, decimals: 0 },
  ],
  formula: 'P * r * t / 100',
  prompt_template: 'Principal {P}, rate {r}%, {t} years — simple interest?',
  decimals: 2,
  tolerance: 0.01,
}

describe('generateInstance', () => {
  test('fills the prompt and computes the expected answer', () => {
    const instance = generateInstance(interestSpec, () => 0.5)
    expect(instance.values).toEqual({ P: 1000, r: 5, t: 2 })
    expect(instance.prompt).toBe(
      'Principal 1000, rate 5%, 2 years — simple interest?',
    )
    expect(instance.expected).toBe(100)
  })

  test('rolls values inside each variable range with the given decimals', () => {
    const spec: CalcSpec = {
      variables: [{ name: 'x', min: 0, max: 10, decimals: 0 }],
      formula: 'x * 2',
      prompt_template: 'Double {x}',
      decimals: 0,
      tolerance: 0,
    }
    const instance = generateInstance(spec, () => 0.25)
    expect(instance.values.x).toBe(3) // round(0 + 0.25*10)
    expect(instance.expected).toBe(6)
    expect(instance.prompt).toBe('Double 3')
  })
})

describe('gradeCalc', () => {
  test('accepts an answer within tolerance', () => {
    expect(gradeCalc(interestSpec, { P: 1000, r: 5, t: 2 }, 100)).toBe(true)
    expect(gradeCalc(interestSpec, { P: 1000, r: 5, t: 2 }, 100.005)).toBe(true)
  })

  test('rejects an answer outside tolerance', () => {
    expect(gradeCalc(interestSpec, { P: 1000, r: 5, t: 2 }, 99)).toBe(false)
  })

  test('rejects a non-finite answer', () => {
    expect(gradeCalc(interestSpec, { P: 1000, r: 5, t: 2 }, NaN)).toBe(false)
  })

  test('returns false (never throws) when values are missing a variable', () => {
    // A tampered/short submission must not crash the server re-grade.
    expect(gradeCalc(interestSpec, { P: 1000 }, 100)).toBe(false)
  })
})

describe('validateCalcSpec', () => {
  test('accepts a well-formed spec', () => {
    const spec = validateCalcSpec({
      variables: [{ name: 'x', min: 1, max: 9, decimals: 0 }],
      formula: 'x * x',
      prompt_template: 'Square {x}',
      decimals: 0,
      tolerance: 0,
    })
    expect(spec).not.toBeNull()
    expect(spec?.formula).toBe('x * x')
  })

  test('swaps reversed min/max and defaults decimals/tolerance', () => {
    const spec = validateCalcSpec({
      variables: [{ name: 'x', min: 9, max: 1 }],
      formula: 'x + 1',
      prompt_template: 'Add one to {x}',
    })
    expect(spec?.variables[0]).toEqual({ name: 'x', min: 1, max: 9, decimals: 0 })
    expect(spec?.decimals).toBe(2)
    expect(spec?.tolerance).toBe(0.01)
  })

  test('rejects a formula that references an undeclared variable', () => {
    expect(
      validateCalcSpec({
        variables: [{ name: 'x', min: 1, max: 2 }],
        formula: 'x + y',
        prompt_template: '{x}',
      }),
    ).toBeNull()
  })

  test('rejects specs with no usable variables or missing fields', () => {
    expect(
      validateCalcSpec({ variables: [], formula: 'x', prompt_template: '{x}' }),
    ).toBeNull()
    expect(
      validateCalcSpec({
        variables: [{ name: '1bad', min: 1, max: 2 }],
        formula: '1bad',
        prompt_template: 'x',
      }),
    ).toBeNull()
    expect(validateCalcSpec('nope')).toBeNull()
  })
})
