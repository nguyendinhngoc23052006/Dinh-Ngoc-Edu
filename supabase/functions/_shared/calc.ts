// Calculation questions: a question stores a formula plus its variables, and
// every time it is shown the UI rolls fresh random values, fills them into the
// prompt, and computes the expected answer. No eval() — a tiny shunting-yard
// parser evaluates the arithmetic, so an AI- or DB-supplied formula string can
// never run arbitrary code. Pure (no Deno/DOM), so it powers both the lesson
// UI (instant feedback) and the server-side credit re-grade from one source.

export interface CalcVariable {
  name: string
  min: number
  max: number
  decimals: number // 0 = whole number
}

export interface CalcSpec {
  variables: CalcVariable[]
  formula: string // arithmetic over the variable names, e.g. "P * r * t / 100"
  prompt_template: string // {name} placeholders, e.g. "Principal {P} at {r}%..."
  decimals: number // rounding applied to the computed answer
  tolerance: number // absolute slack allowed when grading the typed answer
}

export interface CalcInstance {
  prompt: string
  values: Record<string, number>
  expected: number
}

type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }

const BINARY_PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  '^': 3,
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const isDigit = (c: string) => c >= '0' && c <= '9'
  while (i < input.length) {
    const c = input[i] as string
    if (c === ' ' || c === '\t' || c === '\n') {
      i += 1
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1] ?? ''))) {
      let j = i + 1
      while (j < input.length && (isDigit(input[j] as string) || input[j] === '.')) {
        j += 1
      }
      const num = Number(input.slice(i, j))
      if (!Number.isFinite(num)) throw new Error('Malformed number in formula.')
      tokens.push({ type: 'num', value: num })
      i = j
      continue
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j] as string)) j += 1
      tokens.push({ type: 'id', value: input.slice(i, j) })
      i = j
      continue
    }
    if (c === '(' || c === ')') {
      tokens.push({ type: 'paren', value: c })
      i += 1
      continue
    }
    if ('+-*/%^'.includes(c)) {
      const prev = tokens[tokens.length - 1]
      const unary =
        (c === '-' || c === '+') &&
        (!prev ||
          prev.type === 'op' ||
          (prev.type === 'paren' && prev.value === '('))
      tokens.push({ type: 'op', value: unary ? (c === '-' ? 'neg' : 'pos') : c })
      i += 1
      continue
    }
    throw new Error(`Unexpected character "${c}" in formula.`)
  }
  return tokens
}

function precedence(op: string): number {
  return op === 'neg' || op === 'pos' ? 4 : (BINARY_PRECEDENCE[op] ?? 0)
}

function isRightAssociative(op: string): boolean {
  return op === '^' || op === 'neg' || op === 'pos'
}

function applyBinary(op: string, a: number, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '*':
      return a * b
    case '/':
      return a / b
    case '%':
      return a % b
    case '^':
      return Math.pow(a, b)
    default:
      throw new Error(`Unknown operator "${op}".`)
  }
}

// Evaluates the arithmetic formula with the given variable values. Throws on a
// malformed formula or a reference to a variable that has no value.
export function evaluate(formula: string, scope: Record<string, number>): number {
  const output: Token[] = []
  const stack: Token[] = []
  for (const token of tokenize(formula)) {
    if (token.type === 'num' || token.type === 'id') {
      output.push(token)
    } else if (token.type === 'op') {
      while (stack.length > 0) {
        const top = stack[stack.length - 1] as Token
        if (
          top.type === 'op' &&
          (precedence(top.value) > precedence(token.value) ||
            (precedence(top.value) === precedence(token.value) &&
              !isRightAssociative(token.value)))
        ) {
          output.push(stack.pop() as Token)
        } else {
          break
        }
      }
      stack.push(token)
    } else if (token.value === '(') {
      stack.push(token)
    } else {
      while (stack.length > 0 && stack[stack.length - 1]?.type !== 'paren') {
        output.push(stack.pop() as Token)
      }
      if (stack.length === 0) throw new Error('Mismatched parentheses in formula.')
      stack.pop()
    }
  }
  while (stack.length > 0) {
    const op = stack.pop() as Token
    if (op.type === 'paren') throw new Error('Mismatched parentheses in formula.')
    output.push(op)
  }

  const values: number[] = []
  for (const token of output) {
    if (token.type === 'num') {
      values.push(token.value)
    } else if (token.type === 'id') {
      const value = scope[token.value]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`Unknown variable "${token.value}" in formula.`)
      }
      values.push(value)
    } else if (token.value === 'neg' || token.value === 'pos') {
      const a = values.pop()
      if (a === undefined) throw new Error('Malformed formula.')
      values.push(token.value === 'neg' ? -a : a)
    } else {
      const b = values.pop()
      const a = values.pop()
      if (a === undefined || b === undefined) throw new Error('Malformed formula.')
      values.push(applyBinary(token.value, a, b))
    }
  }
  if (values.length !== 1) throw new Error('Malformed formula.')
  const result = values[0] as number
  if (!Number.isFinite(result)) {
    throw new Error('Formula did not evaluate to a finite number.')
  }
  return result
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// The rounded answer for a set of variable values — the one source both the
// generator and the grader (and the UI's "correct answer" hint) agree on.
export function computeExpected(
  spec: CalcSpec,
  values: Record<string, number>,
): number {
  return roundTo(evaluate(spec.formula, values), spec.decimals)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 4))
}

// Rolls fresh random values for every variable, fills them into the prompt
// template, and computes the rounded expected answer.
export function generateInstance(
  spec: CalcSpec,
  random: () => number = Math.random,
): CalcInstance {
  const values: Record<string, number> = {}
  for (const variable of spec.variables) {
    const raw = variable.min + random() * (variable.max - variable.min)
    values[variable.name] = roundTo(raw, variable.decimals)
  }
  const expected = computeExpected(spec, values)
  let prompt = spec.prompt_template
  for (const variable of spec.variables) {
    prompt = prompt.split(`{${variable.name}}`).join(formatNumber(values[variable.name] as number))
  }
  return { prompt, values, expected }
}

// Re-derives the expected answer from the variable values actually shown and
// grades the typed answer within tolerance. Used client-side for feedback and
// server-side (re-computed, never trusting a client-sent "expected") for credit.
export function gradeCalc(
  spec: CalcSpec,
  values: Record<string, number>,
  answer: number,
): boolean {
  if (!Number.isFinite(answer)) return false
  return Math.abs(answer - computeExpected(spec, values)) <= spec.tolerance
}

const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

// Parses an untrusted calc spec (AI output, or a row read back from the DB)
// into a usable CalcSpec, or null if it is unusable. Caps every field and
// confirms the formula actually evaluates over the declared variables.
export function validateCalcSpec(raw: unknown): CalcSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const formula =
    typeof record.formula === 'string' ? record.formula.trim().slice(0, 200) : ''
  const promptTemplate =
    typeof record.prompt_template === 'string'
      ? record.prompt_template.trim().slice(0, 500)
      : ''
  if (!formula || !promptTemplate) return null

  const variables: CalcVariable[] = []
  const rawVariables = Array.isArray(record.variables) ? record.variables : []
  for (const rawVariable of rawVariables.slice(0, 6)) {
    if (!rawVariable || typeof rawVariable !== 'object') continue
    const value = rawVariable as Record<string, unknown>
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (!VARIABLE_NAME.test(name)) continue
    let min = typeof value.min === 'number' ? value.min : NaN
    let max = typeof value.max === 'number' ? value.max : NaN
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue
    if (min > max) [min, max] = [max, min]
    const decimals =
      typeof value.decimals === 'number'
        ? Math.min(Math.max(Math.floor(value.decimals), 0), 4)
        : 0
    variables.push({ name, min, max, decimals })
  }
  if (variables.length === 0) return null
  if (new Set(variables.map((v) => v.name)).size !== variables.length) return null

  const decimals =
    typeof record.decimals === 'number'
      ? Math.min(Math.max(Math.floor(record.decimals), 0), 4)
      : 2
  const tolerance =
    typeof record.tolerance === 'number' && record.tolerance >= 0
      ? Math.min(record.tolerance, 1000)
      : 0.01

  // The formula must reference only declared variables and produce a finite
  // result; reject anything that doesn't evaluate on a midpoint sample.
  try {
    const sample: Record<string, number> = {}
    for (const variable of variables) {
      sample[variable.name] = (variable.min + variable.max) / 2 || 1
    }
    if (!Number.isFinite(evaluate(formula, sample))) return null
  } catch {
    return null
  }
  return { variables, formula, prompt_template: promptTemplate, decimals, tolerance }
}
