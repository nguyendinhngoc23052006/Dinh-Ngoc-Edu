// Calculation questions: a question stores a parametric solver — variables,
// optional ordered intermediate steps, a final formula, a prompt template, a
// rounding spec, and a grading tolerance. Every time the question is shown the
// UI rolls fresh random values into the variables, evaluates the step chain
// and the final formula, fills the prompt, and grades the student's answer
// within tolerance. No eval() — a recursive-descent parser builds an AST and a
// pure-function evaluator walks it through a whitelisted operator/function
// set, so an AI- or DB-supplied spec can never run arbitrary code. Pure (no
// Deno/DOM), so it powers both the lesson UI (instant feedback) and the
// server-side credit re-grade from one source.

export interface CalcVariable {
  name: string
  min: number
  max: number
  decimals: number // 0 = whole number
}

// Ordered intermediate binding: each step's formula evaluates in a scope of
// {variables ∪ earlier steps}, and its name binds the result for later steps
// and the final formula. Lets a microeconomics question compute (say)
// quantity, then price, then surplus without nesting one giant expression.
export interface CalcStep {
  name: string
  formula: string
}

export interface CalcSpec {
  variables: CalcVariable[]
  steps?: CalcStep[]
  formula: string
  prompt_template: string
  decimals: number
  tolerance: number
}

export interface CalcInstance {
  prompt: string
  values: Record<string, number>
  expected: number
}

// Bounded execution invariants. Tampered or model-hallucinated specs that ask
// for more than these get rejected — both at validation (worst case from
// midpoint sample) and at runtime (hard backstop). Quiz answers never need
// more than a few thousand iterations; calculus-shaped questions (Riemann,
// Newton) converge in dozens.
const MAX_ITERATIONS = 10_000
const MAX_EXPRESSION_DEPTH = 200
const MAX_FORMULA_CHARS = 500

// ────────────────────────────────────────────────────────────────────────────
// Lexer
// ────────────────────────────────────────────────────────────────────────────

type Token =
  | { type: 'num'; value: number }
  | { type: 'id'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' }
  | { type: 'question' }
  | { type: 'colon' }

// Multi-char operators must be matched longest-first so '<=' is one token, not
// '<' followed by '='. Order matters here.
const MULTI_CHAR_OPS = ['<=', '>=', '==', '!=', '&&', '||']

function tokenize(input: string): Token[] {
  if (input.length > MAX_FORMULA_CHARS) {
    throw new Error(`Formula exceeds ${MAX_FORMULA_CHARS}-char limit.`)
  }
  const tokens: Token[] = []
  let i = 0
  const isDigit = (c: string) => c >= '0' && c <= '9'
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c)
  const isIdCont = (c: string) => /[A-Za-z0-9_]/.test(c)
  while (i < input.length) {
    const c = input[i] as string
    if (c === ' ' || c === '\t' || c === '\n') {
      i += 1
      continue
    }
    if (isDigit(c) || (c === '.' && isDigit(input[i + 1] ?? ''))) {
      let j = i + 1
      while (
        j < input.length &&
        (isDigit(input[j] as string) || input[j] === '.')
      ) {
        j += 1
      }
      const num = Number(input.slice(i, j))
      if (!Number.isFinite(num)) throw new Error('Malformed number in formula.')
      tokens.push({ type: 'num', value: num })
      i = j
      continue
    }
    if (isIdStart(c)) {
      let j = i + 1
      while (j < input.length && isIdCont(input[j] as string)) j += 1
      tokens.push({ type: 'id', value: input.slice(i, j) })
      i = j
      continue
    }
    if (c === '(') {
      tokens.push({ type: 'lparen' })
      i += 1
      continue
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' })
      i += 1
      continue
    }
    if (c === ',') {
      tokens.push({ type: 'comma' })
      i += 1
      continue
    }
    if (c === '?') {
      tokens.push({ type: 'question' })
      i += 1
      continue
    }
    if (c === ':') {
      tokens.push({ type: 'colon' })
      i += 1
      continue
    }
    const two = input.slice(i, i + 2)
    if (MULTI_CHAR_OPS.includes(two)) {
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }
    if ('+-*/%^<>!'.includes(c)) {
      tokens.push({ type: 'op', value: c })
      i += 1
      continue
    }
    throw new Error(`Unexpected character "${c}" in formula.`)
  }
  return tokens
}

// ────────────────────────────────────────────────────────────────────────────
// AST + recursive-descent parser
// ────────────────────────────────────────────────────────────────────────────

type AstNode =
  | { type: 'num'; value: number }
  | { type: 'var'; name: string }
  | { type: 'binop'; op: string; lhs: AstNode; rhs: AstNode }
  | { type: 'unop'; op: string; arg: AstNode }
  | { type: 'ternary'; cond: AstNode; then: AstNode; else_: AstNode }
  | { type: 'call'; name: string; args: AstNode[] }

class Parser {
  private pos = 0
  private depth = 0
  constructor(private tokens: Token[]) {}

  parse(): AstNode {
    const expr = this.parseExpression()
    if (this.pos !== this.tokens.length) {
      throw new Error('Unexpected trailing tokens in formula.')
    }
    return expr
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos]
  }
  private advance(): Token {
    return this.tokens[this.pos++] as Token
  }
  private match(type: Token['type'], value?: string): boolean {
    const t = this.peek()
    if (!t || t.type !== type) return false
    if (value !== undefined && (t as { value?: string }).value !== value)
      return false
    return true
  }
  private consume(type: Token['type'], value?: string): Token {
    if (!this.match(type, value)) {
      throw new Error(`Expected ${value ?? type} in formula.`)
    }
    return this.advance()
  }
  private enter(): void {
    this.depth += 1
    if (this.depth > MAX_EXPRESSION_DEPTH) {
      throw new Error('Formula nesting exceeds depth limit.')
    }
  }
  private leave(): void {
    this.depth -= 1
  }

  private parseExpression(): AstNode {
    return this.parseTernary()
  }

  private parseTernary(): AstNode {
    this.enter()
    const cond = this.parseLogicalOr()
    if (this.match('question')) {
      this.advance()
      const then = this.parseExpression()
      this.consume('colon')
      const else_ = this.parseExpression()
      this.leave()
      return { type: 'ternary', cond, then, else_ }
    }
    this.leave()
    return cond
  }

  private parseLogicalOr(): AstNode {
    let lhs = this.parseLogicalAnd()
    while (this.match('op', '||')) {
      this.advance()
      const rhs = this.parseLogicalAnd()
      lhs = { type: 'binop', op: '||', lhs, rhs }
    }
    return lhs
  }

  private parseLogicalAnd(): AstNode {
    let lhs = this.parseEquality()
    while (this.match('op', '&&')) {
      this.advance()
      const rhs = this.parseEquality()
      lhs = { type: 'binop', op: '&&', lhs, rhs }
    }
    return lhs
  }

  private parseEquality(): AstNode {
    let lhs = this.parseComparison()
    while (this.match('op', '==') || this.match('op', '!=')) {
      const op = (this.advance() as { value: string }).value
      const rhs = this.parseComparison()
      lhs = { type: 'binop', op, lhs, rhs }
    }
    return lhs
  }

  private parseComparison(): AstNode {
    let lhs = this.parseAdditive()
    while (
      this.match('op', '<') ||
      this.match('op', '<=') ||
      this.match('op', '>') ||
      this.match('op', '>=')
    ) {
      const op = (this.advance() as { value: string }).value
      const rhs = this.parseAdditive()
      lhs = { type: 'binop', op, lhs, rhs }
    }
    return lhs
  }

  private parseAdditive(): AstNode {
    let lhs = this.parseMultiplicative()
    while (this.match('op', '+') || this.match('op', '-')) {
      const op = (this.advance() as { value: string }).value
      const rhs = this.parseMultiplicative()
      lhs = { type: 'binop', op, lhs, rhs }
    }
    return lhs
  }

  private parseMultiplicative(): AstNode {
    let lhs = this.parsePower()
    while (
      this.match('op', '*') ||
      this.match('op', '/') ||
      this.match('op', '%')
    ) {
      const op = (this.advance() as { value: string }).value
      const rhs = this.parsePower()
      lhs = { type: 'binop', op, lhs, rhs }
    }
    return lhs
  }

  // Right-associative: 2 ^ 3 ^ 2 = 2 ^ (3 ^ 2) = 512
  private parsePower(): AstNode {
    const lhs = this.parseUnary()
    if (this.match('op', '^')) {
      this.advance()
      const rhs = this.parsePower()
      return { type: 'binop', op: '^', lhs, rhs }
    }
    return lhs
  }

  private parseUnary(): AstNode {
    if (this.match('op', '-')) {
      this.advance()
      return { type: 'unop', op: '-', arg: this.parseUnary() }
    }
    if (this.match('op', '+')) {
      this.advance()
      return { type: 'unop', op: '+', arg: this.parseUnary() }
    }
    if (this.match('op', '!')) {
      this.advance()
      return { type: 'unop', op: '!', arg: this.parseUnary() }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): AstNode {
    const t = this.peek()
    if (!t) throw new Error('Unexpected end of formula.')
    if (t.type === 'num') {
      this.advance()
      return { type: 'num', value: t.value }
    }
    if (t.type === 'lparen') {
      this.advance()
      const inner = this.parseExpression()
      this.consume('rparen')
      return inner
    }
    if (t.type === 'id') {
      this.advance()
      if (this.match('lparen')) {
        this.advance()
        const args: AstNode[] = []
        if (!this.match('rparen')) {
          args.push(this.parseExpression())
          while (this.match('comma')) {
            this.advance()
            args.push(this.parseExpression())
          }
        }
        this.consume('rparen')
        return { type: 'call', name: t.value, args }
      }
      return { type: 'var', name: t.value }
    }
    throw new Error('Unexpected token in formula.')
  }
}

function parseFormula(formula: string): AstNode {
  return new Parser(tokenize(formula)).parse()
}

// ────────────────────────────────────────────────────────────────────────────
// Constants + function registry (every callable is a deterministic, bounded
// pure function — no eval, no dynamic dispatch, no external IO)
// ────────────────────────────────────────────────────────────────────────────

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
}

type FunctionDef =
  | { arity: number | 'variadic'; fn: (args: number[]) => number }
  | { kind: 'special' } // sigma, pi_iter, iterate, cases — evaluated with custom scoping

const FUNCTIONS: Record<string, FunctionDef> = {
  // ── Basic ──
  abs: { arity: 1, fn: ([x]) => Math.abs(x as number) },
  sign: { arity: 1, fn: ([x]) => Math.sign(x as number) },
  min: { arity: 'variadic', fn: (a) => Math.min(...a) },
  max: { arity: 'variadic', fn: (a) => Math.max(...a) },
  sqrt: { arity: 1, fn: ([x]) => Math.sqrt(x as number) },
  cbrt: { arity: 1, fn: ([x]) => Math.cbrt(x as number) },
  pow: { arity: 2, fn: ([b, e]) => (b as number) ** (e as number) },
  mod: {
    arity: 2,
    fn: ([a, b]) =>
      (a as number) - (b as number) * Math.floor((a as number) / (b as number)),
  },

  // ── Exponential / logarithmic ──
  exp: { arity: 1, fn: ([x]) => Math.exp(x as number) },
  ln: { arity: 1, fn: ([x]) => Math.log(x as number) },
  log: { arity: 1, fn: ([x]) => Math.log(x as number) },
  log2: { arity: 1, fn: ([x]) => Math.log2(x as number) },
  log10: { arity: 1, fn: ([x]) => Math.log10(x as number) },
  logb: {
    arity: 2,
    fn: ([b, x]) => Math.log(x as number) / Math.log(b as number),
  },

  // ── Trig (radians) ──
  sin: { arity: 1, fn: ([x]) => Math.sin(x as number) },
  cos: { arity: 1, fn: ([x]) => Math.cos(x as number) },
  tan: { arity: 1, fn: ([x]) => Math.tan(x as number) },
  asin: { arity: 1, fn: ([x]) => Math.asin(x as number) },
  acos: { arity: 1, fn: ([x]) => Math.acos(x as number) },
  atan: { arity: 1, fn: ([x]) => Math.atan(x as number) },
  atan2: { arity: 2, fn: ([y, x]) => Math.atan2(y as number, x as number) },

  // ── Hyperbolic ──
  sinh: { arity: 1, fn: ([x]) => Math.sinh(x as number) },
  cosh: { arity: 1, fn: ([x]) => Math.cosh(x as number) },
  tanh: { arity: 1, fn: ([x]) => Math.tanh(x as number) },
  asinh: { arity: 1, fn: ([x]) => Math.asinh(x as number) },
  acosh: { arity: 1, fn: ([x]) => Math.acosh(x as number) },
  atanh: { arity: 1, fn: ([x]) => Math.atanh(x as number) },

  // ── Rounding ──
  floor: { arity: 1, fn: ([x]) => Math.floor(x as number) },
  ceil: { arity: 1, fn: ([x]) => Math.ceil(x as number) },
  round: { arity: 1, fn: ([x]) => Math.round(x as number) },
  trunc: { arity: 1, fn: ([x]) => Math.trunc(x as number) },

  // ── Combinatorics / number theory ──
  factorial: { arity: 1, fn: ([n]) => factorialOf(n as number) },
  choose: { arity: 2, fn: ([n, k]) => chooseOf(n as number, k as number) },
  perm: {
    arity: 2,
    fn: ([n, k]) =>
      factorialOf(n as number) / factorialOf((n as number) - (k as number)),
  },
  gcd: {
    arity: 2,
    fn: ([a, b]) =>
      gcdOf(
        Math.abs(Math.trunc(a as number)),
        Math.abs(Math.trunc(b as number)),
      ),
  },
  lcm: {
    arity: 2,
    fn: ([a, b]) => {
      const aa = Math.abs(Math.trunc(a as number))
      const bb = Math.abs(Math.trunc(b as number))
      if (aa === 0 || bb === 0) return 0
      return (aa * bb) / gcdOf(aa, bb)
    },
  },

  // ── Statistics (variadic) ──
  sum: { arity: 'variadic', fn: (a) => a.reduce((s, x) => s + x, 0) },
  prod: { arity: 'variadic', fn: (a) => a.reduce((p, x) => p * x, 1) },
  mean: {
    arity: 'variadic',
    fn: (a) =>
      a.length === 0 ? Number.NaN : a.reduce((s, x) => s + x, 0) / a.length,
  },
  median: {
    arity: 'variadic',
    fn: (a) => {
      if (a.length === 0) return Number.NaN
      const sorted = [...a].sort((x, y) => x - y)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
        : (sorted[mid] as number)
    },
  },
  variance: {
    arity: 'variadic',
    fn: (a) => {
      if (a.length === 0) return Number.NaN
      const m = a.reduce((s, x) => s + x, 0) / a.length
      return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length
    },
  },
  stdev: {
    arity: 'variadic',
    fn: (a) => {
      if (a.length === 0) return Number.NaN
      const m = a.reduce((s, x) => s + x, 0) / a.length
      return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length)
    },
  },

  // ── Probability (closed-form / Abramowitz-Stegun erf approximation) ──
  binom_pmf: {
    arity: 3,
    fn: ([n, k, p]) => binomPmf(n as number, k as number, p as number),
  },
  binom_cdf: {
    arity: 3,
    fn: ([n, k, p]) => binomCdf(n as number, k as number, p as number),
  },
  normal_pdf: {
    arity: 3,
    fn: ([x, mu, sigma]) =>
      normalPdf(x as number, mu as number, sigma as number),
  },
  normal_cdf: {
    arity: 3,
    fn: ([x, mu, sigma]) =>
      normalCdf(x as number, mu as number, sigma as number),
  },
  poisson_pmf: {
    arity: 2,
    fn: ([k, lam]) => poissonPmf(k as number, lam as number),
  },
  poisson_cdf: {
    arity: 2,
    fn: ([k, lam]) => poissonCdf(k as number, lam as number),
  },

  // ── Specials (evaluated with custom scoping) ──
  sigma: { kind: 'special' },
  pi_iter: { kind: 'special' },
  iterate: { kind: 'special' },
  cases: { kind: 'special' },
}

const RESERVED_NAMES = new Set([
  ...Object.keys(FUNCTIONS),
  ...Object.keys(CONSTANTS),
])

function factorialOf(n: number): number {
  if (!Number.isFinite(n) || n < 0 || n !== Math.trunc(n)) return Number.NaN
  if (n > 170) return Number.POSITIVE_INFINITY
  let r = 1
  for (let i = 2; i <= n; i += 1) r *= i
  return r
}

function chooseOf(n: number, k: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(k)) return Number.NaN
  // biome-ignore lint/style/noParameterAssign: numerical algorithm — truncating inputs in-place is the standard combinatorics pattern
  n = Math.trunc(n)
  // biome-ignore lint/style/noParameterAssign: numerical algorithm
  k = Math.trunc(k)
  if (k < 0 || k > n) return 0
  // biome-ignore lint/style/noParameterAssign: numerical algorithm — mirror symmetry optimisation C(n,k)=C(n,n-k)
  if (k > n - k) k = n - k
  let r = 1
  for (let i = 0; i < k; i += 1) r = (r * (n - i)) / (i + 1)
  return Math.round(r)
}

function gcdOf(a: number, b: number): number {
  while (b !== 0) {
    // biome-ignore lint/style/noParameterAssign: Euclidean GCD — standard destructuring swap in-place
    ;[a, b] = [b, a % b]
  }
  return a
}

// ── Probability closed-form helpers ──

function binomPmf(n: number, k: number, p: number): number {
  if (!Number.isFinite(n) || !Number.isFinite(k) || !Number.isFinite(p))
    return Number.NaN
  if (k < 0 || k > n || p < 0 || p > 1) return 0
  return chooseOf(n, k) * p ** k * (1 - p) ** (n - k)
}

function binomCdf(n: number, k: number, p: number): number {
  if (k < 0) return 0
  if (k >= n) return 1
  let s = 0
  for (let i = 0; i <= Math.floor(k); i += 1) s += binomPmf(n, i, p)
  return s
}

function normalPdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return Number.NaN
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
}

// Abramowitz-Stegun 7.1.26 — max error ≈ 1.5e-7. Plenty for a quiz answer
// within `tolerance` (default 0.01). No table lookup, no series convergence.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * ax)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-ax * ax)
  return sign * y
}

function normalCdf(x: number, mu: number, sigma: number): number {
  if (sigma <= 0) return Number.NaN
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.sqrt(2))))
}

function poissonPmf(k: number, lam: number): number {
  if (lam < 0 || k < 0 || k !== Math.trunc(k)) return Number.NaN
  return (Math.exp(-lam) * lam ** k) / factorialOf(k)
}

function poissonCdf(k: number, lam: number): number {
  if (k < 0) return 0
  let s = 0
  for (let i = 0; i <= Math.floor(k); i += 1) s += poissonPmf(i, lam)
  return s
}

// ────────────────────────────────────────────────────────────────────────────
// Evaluator
// ────────────────────────────────────────────────────────────────────────────

function truthy(v: number): boolean {
  return v !== 0 && !Number.isNaN(v)
}

function evaluateAst(node: AstNode, scope: Record<string, number>): number {
  if (node.type === 'num') return node.value
  if (node.type === 'var') {
    if (Object.prototype.hasOwnProperty.call(scope, node.name)) {
      const v = scope[node.name]
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`Variable "${node.name}" is not a finite number.`)
      }
      return v
    }
    if (node.name in CONSTANTS) return CONSTANTS[node.name] as number
    throw new Error(`Unknown variable "${node.name}" in formula.`)
  }
  if (node.type === 'unop') {
    const a = evaluateAst(node.arg, scope)
    if (node.op === '-') return -a
    if (node.op === '+') return a
    if (node.op === '!') return truthy(a) ? 0 : 1
    throw new Error(`Unknown unary operator "${node.op}".`)
  }
  if (node.type === 'ternary') {
    return truthy(evaluateAst(node.cond, scope))
      ? evaluateAst(node.then, scope)
      : evaluateAst(node.else_, scope)
  }
  if (node.type === 'binop') {
    if (node.op === '&&') {
      const a = evaluateAst(node.lhs, scope)
      return truthy(a) ? (truthy(evaluateAst(node.rhs, scope)) ? 1 : 0) : 0
    }
    if (node.op === '||') {
      const a = evaluateAst(node.lhs, scope)
      return truthy(a) ? 1 : truthy(evaluateAst(node.rhs, scope)) ? 1 : 0
    }
    const a = evaluateAst(node.lhs, scope)
    const b = evaluateAst(node.rhs, scope)
    switch (node.op) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      case '/':
        return a / b
      case '%':
        return a - b * Math.floor(a / b)
      case '^':
        return a ** b
      case '<':
        return a < b ? 1 : 0
      case '<=':
        return a <= b ? 1 : 0
      case '>':
        return a > b ? 1 : 0
      case '>=':
        return a >= b ? 1 : 0
      case '==':
        return a === b ? 1 : 0
      case '!=':
        return a !== b ? 1 : 0
      default:
        throw new Error(`Unknown operator "${node.op}".`)
    }
  }
  if (node.type === 'call') return evaluateCall(node, scope)
  throw new Error('Unknown AST node.')
}

function evaluateCall(
  node: { type: 'call'; name: string; args: AstNode[] },
  scope: Record<string, number>,
): number {
  const def = FUNCTIONS[node.name]
  if (!def) throw new Error(`Unknown function "${node.name}".`)
  if ('kind' in def && def.kind === 'special') {
    return evaluateSpecialCall(node.name, node.args, scope)
  }
  const fnDef = def as {
    arity: number | 'variadic'
    fn: (args: number[]) => number
  }
  if (fnDef.arity !== 'variadic' && node.args.length !== fnDef.arity) {
    throw new Error(
      `"${node.name}" expects ${fnDef.arity} arg(s), got ${node.args.length}.`,
    )
  }
  const values = node.args.map((arg) => evaluateAst(arg, scope))
  return fnDef.fn(values)
}

// Specials use custom scoping: `sigma(lo, hi, body)` binds `i` over the
// integer range; `iterate(init, count, body)` binds `x` over each iteration;
// `cases(c1, v1, c2, v2, ..., default)` short-circuits like a switch.
function evaluateSpecialCall(
  name: string,
  args: AstNode[],
  scope: Record<string, number>,
): number {
  if (name === 'sigma' || name === 'pi_iter') {
    if (args.length !== 3)
      throw new Error(`"${name}" expects 3 args: (lo, hi, body).`)
    const lo = Math.round(evaluateAst(args[0] as AstNode, scope))
    const hi = Math.round(evaluateAst(args[1] as AstNode, scope))
    if (!Number.isFinite(lo) || !Number.isFinite(hi))
      throw new Error(`"${name}" bounds must be finite.`)
    const span = hi - lo + 1
    if (span < 0 || span > MAX_ITERATIONS) {
      throw new Error(`"${name}" range exceeds ${MAX_ITERATIONS} iterations.`)
    }
    let acc = name === 'sigma' ? 0 : 1
    const inner: Record<string, number> = { ...scope }
    for (let i = lo; i <= hi; i += 1) {
      inner.i = i
      const v = evaluateAst(args[2] as AstNode, inner)
      acc = name === 'sigma' ? acc + v : acc * v
    }
    return acc
  }
  if (name === 'iterate') {
    if (args.length !== 3)
      throw new Error('"iterate" expects 3 args: (init, count, body).')
    const init = evaluateAst(args[0] as AstNode, scope)
    const count = Math.round(evaluateAst(args[1] as AstNode, scope))
    if (!Number.isFinite(count) || count < 0 || count > MAX_ITERATIONS) {
      throw new Error(`"iterate" count must be in [0, ${MAX_ITERATIONS}].`)
    }
    const inner: Record<string, number> = { ...scope }
    let x = init
    for (let i = 0; i < count; i += 1) {
      inner.x = x
      x = evaluateAst(args[2] as AstNode, inner)
      if (!Number.isFinite(x))
        throw new Error('"iterate" diverged to a non-finite value.')
    }
    return x
  }
  if (name === 'cases') {
    if (args.length < 1)
      throw new Error('"cases" needs at least a default value.')
    // Pairs of (cond, val), then a trailing default.
    if (args.length % 2 !== 1) {
      throw new Error(
        '"cases" needs an odd arg count: (cond1, val1, cond2, val2, ..., default).',
      )
    }
    for (let i = 0; i < args.length - 1; i += 2) {
      const cond = evaluateAst(args[i] as AstNode, scope)
      if (truthy(cond)) return evaluateAst(args[i + 1] as AstNode, scope)
    }
    return evaluateAst(args[args.length - 1] as AstNode, scope)
  }
  throw new Error(`Unknown special function "${name}".`)
}

// Public: parse + evaluate a single formula in one shot.
export function evaluate(
  formula: string,
  scope: Record<string, number>,
): number {
  const result = evaluateAst(parseFormula(formula), scope)
  if (!Number.isFinite(result)) {
    throw new Error('Formula did not evaluate to a finite number.')
  }
  return result
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// The rounded answer for a set of variable values — first runs each step in
// order (binding its name in the scope), then runs the final formula over the
// extended scope. The one source the generator, the lesson UI, and the
// server-side regrade all agree on.
export function computeExpected(
  spec: CalcSpec,
  values: Record<string, number>,
): number {
  const scope: Record<string, number> = { ...values }
  for (const step of spec.steps ?? []) {
    const v = evaluate(step.formula, scope)
    scope[step.name] = v
  }
  return roundTo(evaluate(spec.formula, scope), spec.decimals)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(roundTo(value, 4))
}

// Rolls fresh random values for every variable, runs the step chain + final
// formula, fills the prompt template, returns the instance.
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
    prompt = prompt
      .split(`{${variable.name}}`)
      .join(formatNumber(values[variable.name] as number))
  }
  return { prompt, values, expected }
}

// Re-derives the expected answer from the variable values shown and grades
// the typed answer within tolerance. Used client-side for feedback and
// server-side (re-computed, never trusting a client-sent "expected") for credit.
export function gradeCalc(
  spec: CalcSpec,
  values: Record<string, number>,
  answer: number,
): boolean {
  if (!Number.isFinite(answer)) return false
  try {
    return Math.abs(answer - computeExpected(spec, values)) <= spec.tolerance
  } catch {
    return false
  }
}

const VARIABLE_NAME = /^[A-Za-z][A-Za-z0-9_]*$/

// Parses an untrusted calc spec (AI output, or a row read back from the DB)
// into a usable CalcSpec, or null if it is unusable. Caps every field and
// confirms the formula actually evaluates on a midpoint sample of the
// variable ranges, with all step bindings in scope.
export function validateCalcSpec(raw: unknown): CalcSpec | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const formula =
    typeof record.formula === 'string'
      ? record.formula.trim().slice(0, MAX_FORMULA_CHARS)
      : ''
  const promptTemplate =
    typeof record.prompt_template === 'string'
      ? record.prompt_template.trim().slice(0, 500)
      : ''
  if (!formula || !promptTemplate) return null

  // A prompt asking for two separate values (e.g. "how much … and how much …")
  // cannot be graded by a single formula — the second value is silently dropped.
  // Reject here so the generator is forced to split it into two questions.
  if (
    (promptTemplate.match(/\?/g) ?? []).length > 1 ||
    /,?\s+and\s+(how\s+(?:much|many)|what)\b/i.test(promptTemplate)
  )
    return null

  const variables: CalcVariable[] = []
  const rawVariables = Array.isArray(record.variables) ? record.variables : []
  for (const rawVariable of rawVariables.slice(0, 8)) {
    if (!rawVariable || typeof rawVariable !== 'object') continue
    const value = rawVariable as Record<string, unknown>
    const name = typeof value.name === 'string' ? value.name.trim() : ''
    if (!VARIABLE_NAME.test(name) || RESERVED_NAMES.has(name)) continue
    let min = typeof value.min === 'number' ? value.min : Number.NaN
    let max = typeof value.max === 'number' ? value.max : Number.NaN
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue
    if (min > max) [min, max] = [max, min]
    const decimals =
      typeof value.decimals === 'number'
        ? Math.min(Math.max(Math.floor(value.decimals), 0), 4)
        : 0
    variables.push({ name, min, max, decimals })
  }
  if (variables.length === 0) return null
  if (new Set(variables.map((v) => v.name)).size !== variables.length)
    return null

  // Step parsing: each step's name must be a fresh, unreserved identifier and
  // its formula must parse + evaluate on the running midpoint sample. A
  // shadowing or unbound step rejects the whole spec.
  const steps: CalcStep[] = []
  const rawSteps = Array.isArray(record.steps) ? record.steps : []
  const knownNames = new Set(variables.map((v) => v.name))
  const sample: Record<string, number> = {}
  for (const variable of variables) {
    sample[variable.name] = (variable.min + variable.max) / 2 || 1
  }
  for (const rawStep of rawSteps.slice(0, 12)) {
    if (!rawStep || typeof rawStep !== 'object') return null
    const stepRec = rawStep as Record<string, unknown>
    const stepName = typeof stepRec.name === 'string' ? stepRec.name.trim() : ''
    const stepFormula =
      typeof stepRec.formula === 'string'
        ? stepRec.formula.trim().slice(0, MAX_FORMULA_CHARS)
        : ''
    if (!VARIABLE_NAME.test(stepName) || RESERVED_NAMES.has(stepName))
      return null
    if (knownNames.has(stepName)) return null
    if (!stepFormula) return null
    try {
      const v = evaluate(stepFormula, sample)
      if (!Number.isFinite(v)) return null
      sample[stepName] = v
    } catch {
      return null
    }
    steps.push({ name: stepName, formula: stepFormula })
    knownNames.add(stepName)
  }

  const decimals =
    typeof record.decimals === 'number'
      ? Math.min(Math.max(Math.floor(record.decimals), 0), 4)
      : 2
  const tolerance =
    typeof record.tolerance === 'number' && record.tolerance >= 0
      ? Math.min(record.tolerance, 1000)
      : 0.01

  try {
    if (!Number.isFinite(evaluate(formula, sample))) return null
  } catch {
    return null
  }
  return {
    variables,
    ...(steps.length > 0 ? { steps } : {}),
    formula,
    prompt_template: promptTemplate,
    decimals,
    tolerance,
  }
}
