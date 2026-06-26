import { describe, expect, test } from 'vitest'
import { evaluate, generateInstance, gradeCalc, validateCalcSpec } from './calc'
import type { CalcSpec } from './calc'

describe('evaluate — basic arithmetic', () => {
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
    expect(() => evaluate('(1 + 2', {})).toThrow(/parentheses|formula/i)
  })

  test('throws on an unexpected character (no code execution)', () => {
    expect(() => evaluate('1 + alert(2)', {})).toThrow(
      /Unknown function "alert"/,
    )
    expect(() => evaluate('1 & 2', {})).toThrow(/Unexpected character/)
  })

  test('modulo follows floored-division semantics (positive result on negative lhs)', () => {
    expect(evaluate('-7 % 3', {})).toBe(2)
  })
})

describe('evaluate — comparison + logical + ternary', () => {
  test('comparison ops return 1 or 0', () => {
    expect(evaluate('3 < 5', {})).toBe(1)
    expect(evaluate('3 > 5', {})).toBe(0)
    expect(evaluate('3 <= 3', {})).toBe(1)
    expect(evaluate('3 >= 4', {})).toBe(0)
    expect(evaluate('3 == 3', {})).toBe(1)
    expect(evaluate('3 != 3', {})).toBe(0)
  })

  test('logical ops short-circuit and return 1 or 0', () => {
    expect(evaluate('1 && 0', {})).toBe(0)
    expect(evaluate('0 || 5', {})).toBe(1)
    expect(evaluate('!0', {})).toBe(1)
    expect(evaluate('!5', {})).toBe(0)
  })

  test('ternary picks the right branch', () => {
    expect(evaluate('1 < 2 ? 10 : 20', {})).toBe(10)
    expect(evaluate('1 > 2 ? 10 : 20', {})).toBe(20)
  })

  test('ternary nests right-associatively', () => {
    expect(evaluate('a > 0 ? 1 : a < 0 ? -1 : 0', { a: -5 })).toBe(-1)
    expect(evaluate('a > 0 ? 1 : a < 0 ? -1 : 0', { a: 0 })).toBe(0)
    expect(evaluate('a > 0 ? 1 : a < 0 ? -1 : 0', { a: 7 })).toBe(1)
  })

  test('piecewise tax bracket (the canonical micro example)', () => {
    expect(
      evaluate('income > 50 ? 50 * 0.2 + (income - 50) * 0.3 : income * 0.2', {
        income: 80,
      }),
    ).toBe(50 * 0.2 + 30 * 0.3)
    expect(
      evaluate('income > 50 ? 50 * 0.2 + (income - 50) * 0.3 : income * 0.2', {
        income: 30,
      }),
    ).toBe(6)
  })
})

describe('evaluate — constants', () => {
  test('pi and e resolve to Math.PI and Math.E', () => {
    expect(evaluate('pi', {})).toBeCloseTo(Math.PI, 10)
    expect(evaluate('e', {})).toBeCloseTo(Math.E, 10)
  })

  test('a scope variable shadows a constant', () => {
    expect(evaluate('pi', { pi: 3 })).toBe(3)
  })
})

describe('evaluate — basic functions', () => {
  test('abs/sign/min/max/sqrt/cbrt/pow', () => {
    expect(evaluate('abs(-7)', {})).toBe(7)
    expect(evaluate('sign(-3)', {})).toBe(-1)
    expect(evaluate('min(2, 5, 1, 9)', {})).toBe(1)
    expect(evaluate('max(2, 5, 1, 9)', {})).toBe(9)
    expect(evaluate('sqrt(16)', {})).toBe(4)
    expect(evaluate('cbrt(27)', {})).toBe(3)
    expect(evaluate('pow(2, 10)', {})).toBe(1024)
  })

  test('mod follows floored-division semantics (matches % operator)', () => {
    expect(evaluate('mod(-7, 3)', {})).toBe(2)
  })

  test('rounding family', () => {
    expect(evaluate('floor(2.7)', {})).toBe(2)
    expect(evaluate('ceil(2.1)', {})).toBe(3)
    expect(evaluate('round(2.5)', {})).toBe(3)
    expect(evaluate('trunc(-2.7)', {})).toBe(-2)
  })

  test('exponential / logarithmic', () => {
    expect(evaluate('exp(0)', {})).toBe(1)
    expect(evaluate('ln(e)', {})).toBeCloseTo(1, 10)
    expect(evaluate('log(e)', {})).toBeCloseTo(1, 10)
    expect(evaluate('log10(1000)', {})).toBeCloseTo(3, 10)
    expect(evaluate('log2(8)', {})).toBe(3)
    expect(evaluate('logb(2, 8)', {})).toBe(3)
  })

  test('trig (radians) round-trip', () => {
    expect(evaluate('sin(pi / 2)', {})).toBeCloseTo(1, 10)
    expect(evaluate('cos(0)', {})).toBeCloseTo(1, 10)
    expect(evaluate('tan(pi / 4)', {})).toBeCloseTo(1, 10)
    expect(evaluate('asin(1)', {})).toBeCloseTo(Math.PI / 2, 10)
    expect(evaluate('acos(0)', {})).toBeCloseTo(Math.PI / 2, 10)
    expect(evaluate('atan(1)', {})).toBeCloseTo(Math.PI / 4, 10)
    expect(evaluate('atan2(1, 1)', {})).toBeCloseTo(Math.PI / 4, 10)
  })

  test('hyperbolic round-trip', () => {
    expect(evaluate('sinh(0)', {})).toBe(0)
    expect(evaluate('cosh(0)', {})).toBe(1)
    expect(evaluate('tanh(0)', {})).toBe(0)
    expect(evaluate('asinh(sinh(2))', {})).toBeCloseTo(2, 10)
    expect(evaluate('acosh(cosh(2))', {})).toBeCloseTo(2, 10)
    expect(evaluate('atanh(tanh(0.5))', {})).toBeCloseTo(0.5, 10)
  })
})

describe('evaluate — combinatorics + number theory', () => {
  test('factorial', () => {
    expect(evaluate('factorial(0)', {})).toBe(1)
    expect(evaluate('factorial(5)', {})).toBe(120)
    expect(() => evaluate('factorial(-1)', {})).toThrow(/finite/i)
  })

  test('choose (n choose k)', () => {
    expect(evaluate('choose(5, 2)', {})).toBe(10)
    expect(evaluate('choose(10, 3)', {})).toBe(120)
    expect(evaluate('choose(5, 10)', {})).toBe(0)
  })

  test('perm (n perm k)', () => {
    expect(evaluate('perm(5, 2)', {})).toBe(20)
  })

  test('gcd / lcm', () => {
    expect(evaluate('gcd(12, 18)', {})).toBe(6)
    expect(evaluate('lcm(4, 6)', {})).toBe(12)
    expect(evaluate('lcm(0, 5)', {})).toBe(0)
  })
})

describe('evaluate — statistics (variadic)', () => {
  test('sum / prod', () => {
    expect(evaluate('sum(1, 2, 3, 4)', {})).toBe(10)
    expect(evaluate('prod(1, 2, 3, 4)', {})).toBe(24)
  })

  test('mean / median', () => {
    expect(evaluate('mean(1, 2, 3, 4)', {})).toBe(2.5)
    expect(evaluate('median(1, 2, 3, 4)', {})).toBe(2.5)
    expect(evaluate('median(1, 2, 3, 4, 5)', {})).toBe(3)
  })

  test('variance / stdev', () => {
    expect(evaluate('variance(2, 4, 4, 4, 5, 5, 7, 9)', {})).toBe(4)
    expect(evaluate('stdev(2, 4, 4, 4, 5, 5, 7, 9)', {})).toBe(2)
  })
})

describe('evaluate — probability (closed-form / erf-based)', () => {
  test('binom_pmf / binom_cdf', () => {
    // P(X = 2 | n=4, p=0.5) = C(4,2)/16 = 6/16 = 0.375
    expect(evaluate('binom_pmf(4, 2, 0.5)', {})).toBeCloseTo(0.375, 10)
    expect(evaluate('binom_cdf(4, 4, 0.5)', {})).toBeCloseTo(1, 10)
  })

  test('normal_cdf at the mean is 0.5', () => {
    expect(evaluate('normal_cdf(0, 0, 1)', {})).toBeCloseTo(0.5, 6)
  })

  test('normal_cdf ±3σ is ~0.0013 / ~0.9987', () => {
    expect(evaluate('normal_cdf(-3, 0, 1)', {})).toBeCloseTo(0.00135, 4)
    expect(evaluate('normal_cdf(3, 0, 1)', {})).toBeCloseTo(0.99865, 4)
  })

  test('poisson_pmf and cdf', () => {
    // P(X=2 | λ=2) = 2² e⁻² / 2 = 0.2707
    expect(evaluate('poisson_pmf(2, 2)', {})).toBeCloseTo(0.27067, 5)
    expect(evaluate('poisson_cdf(10, 2)', {})).toBeCloseTo(1, 4)
  })
})

describe('evaluate — bounded iteration', () => {
  test('sigma sums an arithmetic series', () => {
    // 1 + 2 + ... + 10 = 55
    expect(evaluate('sigma(1, 10, i)', {})).toBe(55)
  })

  test('sigma uses outer scope variables in the body', () => {
    // ∑ i=1..n of i² with n from scope
    expect(evaluate('sigma(1, n, i * i)', { n: 5 })).toBe(55)
  })

  test('pi_iter multiplies a series', () => {
    expect(evaluate('pi_iter(1, 5, i)', {})).toBe(120)
  })

  test('iterate runs Newton-style fixed-point updates with a bound', () => {
    // sqrt(2) via Newton: x ← (x + 2/x) / 2, 20 iterations starting at 1
    const v = evaluate('iterate(1, 20, (x + 2 / x) / 2)', {})
    expect(v).toBeCloseTo(Math.sqrt(2), 10)
  })

  test('sigma rejects a range over the iteration cap', () => {
    expect(() => evaluate('sigma(1, 100000, i)', {})).toThrow(
      /iterations|range/i,
    )
  })

  test('iterate rejects a count over the cap', () => {
    expect(() => evaluate('iterate(0, 1000000, x + 1)', {})).toThrow(
      /0,|iterations|/i,
    )
  })

  test('iterate rejects a body that diverges to a non-finite value', () => {
    expect(() => evaluate('iterate(1, 5, x * pow(10, 1000))', {})).toThrow(
      /diverged|finite/i,
    )
  })

  test('sigma with hi < lo returns the empty sum', () => {
    expect(evaluate('sigma(5, 4, i)', {})).toBe(0)
  })
})

describe('evaluate — cases (multi-branch conditional)', () => {
  test('returns the first matching value', () => {
    expect(evaluate('cases(a == 1, 10, a == 2, 20, 99)', { a: 2 })).toBe(20)
    expect(evaluate('cases(a == 1, 10, a == 2, 20, 99)', { a: 7 })).toBe(99)
  })

  test('rejects an even arg count (missing default)', () => {
    expect(() => evaluate('cases(1, 2)', {})).toThrow(/cases|default|odd/i)
  })
})

describe('evaluate — safety', () => {
  test('rejects formulas longer than the cap', () => {
    expect(() => evaluate(`${'1+'.repeat(300)}0`, {})).toThrow(/limit|exceeds/)
  })

  test('rejects deeply-nested expressions', () => {
    const nested = `${'('.repeat(250)}1${')'.repeat(250)}`
    expect(() => evaluate(nested, {})).toThrow(/depth|exceeds|limit/i)
  })

  test('rejects unknown functions (cannot escape the whitelist)', () => {
    expect(() => evaluate('eval(1)', {})).toThrow(/Unknown function "eval"/)
    expect(() => evaluate('process(1)', {})).toThrow(
      /Unknown function "process"/,
    )
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
  test('fills the prompt and computes the expected answer (single-formula spec)', () => {
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
    expect(instance.values.x).toBe(3)
    expect(instance.expected).toBe(6)
    expect(instance.prompt).toBe('Double 3')
  })

  test('runs a multi-step spec (consumer surplus, the canonical micro example)', () => {
    // Demand: P = a - b*Q. Supply: P = Q. Equilibrium: Q = a/(b+1), P = a - b*Q.
    // Consumer surplus = 0.5 * (a - P) * Q.
    const spec: CalcSpec = {
      variables: [
        { name: 'a', min: 100, max: 100, decimals: 0 },
        { name: 'b', min: 2, max: 2, decimals: 0 },
      ],
      steps: [
        { name: 'Q_eq', formula: 'a / (b + 1)' },
        { name: 'P_eq', formula: 'a - b * Q_eq' },
      ],
      formula: '0.5 * (a - P_eq) * Q_eq',
      prompt_template: 'Demand P = {a} - {b}Q, supply P = Q. Consumer surplus?',
      decimals: 2,
      tolerance: 0.01,
    }
    // Q = 100/3, P = 100 - 200/3 = 100/3, CS = 0.5 * 200/3 * 100/3 ≈ 1111.11
    const instance = generateInstance(spec, () => 0.5)
    expect(instance.expected).toBeCloseTo(0.5 * (100 / 3) * 2 * (100 / 3), 1)
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
    expect(gradeCalc(interestSpec, { P: 1000, r: 5, t: 2 }, Number.NaN)).toBe(
      false,
    )
  })

  test('returns false (never throws) when values are missing a variable', () => {
    expect(gradeCalc(interestSpec, { P: 1000 }, 100)).toBe(false)
  })

  test('grades a multi-step spec correctly', () => {
    const spec: CalcSpec = {
      variables: [{ name: 'M', min: 100, max: 100, decimals: 0 }],
      steps: [{ name: 'x_opt', formula: 'sqrt(M / 2)' }],
      formula: 'log(x_opt + 1)',
      prompt_template: 'Budget {M}. U(x) = log(x+1). Optimal utility?',
      decimals: 4,
      tolerance: 0.001,
    }
    // x_opt = sqrt(50) ≈ 7.071, log(8.071) ≈ 2.088
    expect(gradeCalc(spec, { M: 100 }, 2.0884)).toBe(true)
    expect(gradeCalc(spec, { M: 100 }, 3)).toBe(false)
  })
})

describe('validateCalcSpec', () => {
  test('accepts a well-formed single-formula spec', () => {
    const spec = validateCalcSpec({
      variables: [{ name: 'x', min: 1, max: 9, decimals: 0 }],
      formula: 'x * x',
      prompt_template: 'Square {x}',
      decimals: 0,
      tolerance: 0,
    })
    expect(spec).not.toBeNull()
    expect(spec?.formula).toBe('x * x')
    expect(spec?.steps).toBeUndefined()
  })

  test('accepts a well-formed multi-step spec', () => {
    const spec = validateCalcSpec({
      variables: [
        { name: 'a', min: 80, max: 120, decimals: 0 },
        { name: 'b', min: 1, max: 3, decimals: 0 },
      ],
      steps: [
        { name: 'Q_eq', formula: 'a / (b + 1)' },
        { name: 'P_eq', formula: 'a - b * Q_eq' },
      ],
      formula: '0.5 * (a - P_eq) * Q_eq',
      prompt_template: 'Demand P = {a} - {b}Q. CS?',
    })
    expect(spec).not.toBeNull()
    expect(spec?.steps).toHaveLength(2)
    expect(spec?.steps?.[1].formula).toBe('a - b * Q_eq')
  })

  test('swaps reversed min/max and defaults decimals/tolerance', () => {
    const spec = validateCalcSpec({
      variables: [{ name: 'x', min: 9, max: 1 }],
      formula: 'x + 1',
      prompt_template: 'Add one to {x}',
    })
    expect(spec?.variables[0]).toEqual({
      name: 'x',
      min: 1,
      max: 9,
      decimals: 0,
    })
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

  test('rejects a step that shadows a variable', () => {
    expect(
      validateCalcSpec({
        variables: [{ name: 'x', min: 1, max: 2 }],
        steps: [{ name: 'x', formula: 'x + 1' }],
        formula: 'x',
        prompt_template: '{x}',
      }),
    ).toBeNull()
  })

  test('rejects a step that references a later step', () => {
    expect(
      validateCalcSpec({
        variables: [{ name: 'a', min: 1, max: 2 }],
        steps: [
          { name: 'first', formula: 'second * 2' },
          { name: 'second', formula: 'a + 1' },
        ],
        formula: 'first + second',
        prompt_template: '{a}',
      }),
    ).toBeNull()
  })

  test('rejects a variable whose name shadows a function', () => {
    expect(
      validateCalcSpec({
        variables: [{ name: 'sin', min: 1, max: 2 }],
        formula: 'sin + 1',
        prompt_template: '{sin}',
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

  test('rejects a step formula that diverges on midpoint sample', () => {
    expect(
      validateCalcSpec({
        variables: [{ name: 'x', min: 1, max: 9, decimals: 0 }],
        steps: [{ name: 'y', formula: '1 / (x - x)' }],
        formula: 'y',
        prompt_template: '{x}',
      }),
    ).toBeNull()
  })

  test('rejects a two-part prompt_template asking for two separate values', () => {
    const base = {
      variables: [
        { name: 'a', min: 10, max: 30, decimals: 0 },
        { name: 'b', min: 1, max: 5, decimals: 1 },
      ],
      steps: [{ name: 'q_max', formula: 'a / (2 * b)' }],
      formula: 'a * q_max - b * q_max ^ 2',
      decimals: 2,
      tolerance: 0.5,
    }
    // Conjunctive "and how much" pattern
    expect(
      validateCalcSpec({
        ...base,
        prompt_template:
          'How much will the factory produce to maximize its profit, and how much profit will it then have?',
      }),
    ).toBeNull()
    // Two question marks
    expect(
      validateCalcSpec({
        ...base,
        prompt_template: 'What is q_max? What is the profit?',
      }),
    ).toBeNull()
    // Single-value equivalent is accepted
    expect(
      validateCalcSpec({
        ...base,
        prompt_template:
          'Calculate the total profit the factory earns when producing at its profit-maximising output level.',
      }),
    ).not.toBeNull()
  })
})
