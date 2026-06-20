import { describe, expect, test } from 'vitest'
import { extractXmlText } from '../_shared/xml'
import {
  buildBatchQuestionsPrompt,
  buildDeltaRetryPrompt,
  buildQuestionsSchema,
  buildSyllabusPrompt,
  buildSystemPrompt,
  chunkText,
  emptyNodeIndexes,
  isLatinScript,
  languageReminder,
  lessonCreditPrize,
  matchesOutputLanguage,
  MIN_QUESTIONS_PER_NODE,
  NODES_PER_BATCH,
  parseJsonLoose,
  QUESTIONS_PER_NODE,
  SYLLABUS_SCHEMA,
  validateChapterQuestions,
  validateSyllabus,
  validateSyllabusQuality,
  verifyQuestion,
} from './pipeline'
import type { GeneratedQuestion, SyllabusNode } from './pipeline'

describe('chunkText', () => {
  test('returns nothing for empty input', () => {
    expect(chunkText('   \n\n  ')).toEqual([])
  })

  test('keeps short text as a single chunk', () => {
    expect(chunkText('One paragraph.\n\nAnother.')).toEqual([
      'One paragraph.\n\nAnother.',
    ])
  })

  test('splits on paragraph boundaries at the size limit', () => {
    const chunks = chunkText('aaaa\n\nbbbb\n\ncccc', 10)
    expect(chunks).toEqual(['aaaa\n\nbbbb', 'cccc'])
  })

  test('hard-splits a single oversized paragraph', () => {
    const chunks = chunkText('x'.repeat(25), 10)
    expect(chunks).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)])
  })

  test('caps the number of chunks', () => {
    const text = Array.from({ length: 50 }, (_, i) => `para ${i}`).join('\n\n')
    expect(chunkText(text, 8, 5)).toHaveLength(5)
  })
})

describe('parseJsonLoose', () => {
  test('parses plain JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 })
  })

  test('parses JSON wrapped in a code fence and prose', () => {
    const raw = 'Sure! Here you go:\n```json\n{"a":[1,2]}\n```\nDone.'
    expect(parseJsonLoose(raw)).toEqual({ a: [1, 2] })
  })

  test('throws a readable error when there is no JSON', () => {
    expect(() => parseJsonLoose('no json here')).toThrow(/no JSON/i)
  })

  test('throws a readable error on malformed JSON', () => {
    expect(() => parseJsonLoose('{"a":')).toThrow(/JSON/i)
  })
})

describe('validateSyllabus', () => {
  test('accepts a well-formed syllabus and clamps chunk indexes', () => {
    const syllabus = validateSyllabus(
      {
        chapters: [
          {
            title: 'Intro',
            summary: 'Basics.',
            nodes: [
              { title: 'What is X', chunk_index: 0 },
              { title: 'Way out of range', chunk_index: 99 },
            ],
          },
        ],
      },
      2,
    )
    expect(syllabus).toEqual([
      {
        title: 'Intro',
        summary: 'Basics.',
        nodes: [
          { title: 'What is X', chunk_index: 0 },
          { title: 'Way out of range', chunk_index: 1 },
        ],
      },
    ])
  })

  test('drops chapters without usable nodes and throws when none remain', () => {
    expect(() =>
      validateSyllabus({ chapters: [{ title: 'Empty', nodes: [] }] }, 1),
    ).toThrow(/no usable chapters/i)
  })

  test('throws when the value is not a list at all', () => {
    expect(() => validateSyllabus('nope', 1)).toThrow(/list of chapters/i)
  })
})

describe('validateChapterQuestions', () => {
  test('keeps only questions matching the database contract', () => {
    const buckets = validateChapterQuestions(
      {
        questions: [
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'Pick one',
            options: ['a', 'b', 'c'],
            correct_indexes: [1],
          },
          {
            node_index: 0,
            kind: 'mcq_multi',
            prompt: 'Pick many',
            options: ['a', 'b'],
            correct_indexes: [1, 0, 0],
          },
          {
            node_index: 0,
            kind: 'fill_blank',
            prompt: 'The ____ rises',
            accepted: ['sun'],
          },
          // All of the below are malformed and must be dropped:
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'Two correct',
            options: ['a', 'b'],
            correct_indexes: [0, 1],
          },
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'Index out of range',
            options: ['a', 'b'],
            correct_indexes: [5],
          },
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'One option',
            options: ['a'],
            correct_indexes: [0],
          },
          {
            node_index: 0,
            kind: 'fill_blank',
            prompt: 'No answers',
            accepted: [],
          },
          { node_index: 0, kind: 'essay', prompt: 'Unknown kind' },
          {
            node_index: 0,
            kind: 'mcq',
            prompt: '',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
        ],
      },
      1,
    )
    expect(buckets[0]).toEqual([
      {
        kind: 'mcq',
        difficulty: 'medium',
        prompt: 'Pick one',
        options: ['a', 'b', 'c'],
        answer: { correct_indexes: [1] },
      },
      {
        kind: 'mcq_multi',
        difficulty: 'medium',
        prompt: 'Pick many',
        options: ['a', 'b'],
        answer: { correct_indexes: [0, 1] },
      },
      {
        kind: 'fill_blank',
        difficulty: 'medium',
        prompt: 'The ____ rises',
        options: [],
        answer: { accepted: ['sun'] },
      },
    ])
  })

  test('keeps a valid difficulty tag and defaults an invalid one to medium', () => {
    const buckets = validateChapterQuestions(
      {
        questions: [
          {
            node_index: 0,
            kind: 'mcq',
            difficulty: 'hard',
            prompt: 'Synthesize',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
          {
            node_index: 0,
            kind: 'fill_blank',
            difficulty: 'easy',
            prompt: 'The ____ rises',
            accepted: ['sun'],
          },
          {
            node_index: 0,
            kind: 'mcq',
            difficulty: 'impossible',
            prompt: 'Garbled tag',
            options: ['a', 'b'],
            correct_indexes: [1],
          },
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'No tag at all',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
        ],
      },
      1,
    )
    expect(buckets[0].map((q) => q.difficulty)).toEqual([
      'hard',
      'easy',
      'medium',
      'medium',
    ])
  })

  test('caps persisted string lengths (AI output is untrusted)', () => {
    const buckets = validateChapterQuestions(
      {
        questions: [
          {
            node_index: 0,
            kind: 'mcq',
            prompt: 'p'.repeat(5000),
            options: ['o'.repeat(5000), 'b'],
            correct_indexes: [1],
          },
        ],
      },
      1,
    )
    expect(buckets[0][0].prompt).toHaveLength(1000)
    expect(buckets[0][0].options[0]).toHaveLength(300)
  })

  test('routes questions to their node by node_index', () => {
    const buckets = validateChapterQuestions(
      {
        questions: [
          {
            node_index: 1,
            kind: 'mcq',
            prompt: 'Pick one',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
          {
            node_index: 0,
            kind: 'fill_blank',
            prompt: 'The ____ rises',
            accepted: ['sun'],
          },
        ],
      },
      2,
    )
    expect(buckets[0]).toHaveLength(1)
    expect(buckets[0][0].kind).toBe('fill_blank')
    expect(buckets[1]).toHaveLength(1)
    expect(buckets[1][0].kind).toBe('mcq')
  })

  test('drops out-of-range or missing node_index and malformed entries', () => {
    const buckets = validateChapterQuestions(
      {
        questions: [
          {
            node_index: 9,
            kind: 'mcq',
            prompt: 'Out of range',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
          {
            kind: 'mcq',
            prompt: 'No node_index',
            options: ['a', 'b'],
            correct_indexes: [0],
          },
          { node_index: 0, kind: 'mcq', prompt: 'No options' },
        ],
      },
      1,
    )
    expect(buckets).toEqual([[]])
  })

  test('returns empty buckets per node for garbage instead of throwing', () => {
    expect(validateChapterQuestions('garbage', 3)).toEqual([[], [], []])
  })
})

describe('emptyNodeIndexes', () => {
  const question: GeneratedQuestion = {
    kind: 'mcq',
    difficulty: 'medium',
    prompt: 'Pick one',
    options: ['a', 'b'],
    answer: { correct_indexes: [0] },
  }

  test('names exactly the lessons the chapter answer left empty', () => {
    expect(emptyNodeIndexes([[question], [], [question], []])).toEqual([1, 3])
  })

  test('is empty when every lesson got questions', () => {
    expect(emptyNodeIndexes([[question], [question]])).toEqual([])
  })

  test('covers every lesson when the whole chapter failed to parse', () => {
    expect(emptyNodeIndexes([[], [], []])).toEqual([0, 1, 2])
  })
})

describe('validateSyllabusQuality', () => {
  test('passes a well-proportioned syllabus', () => {
    const syllabus = [
      { title: 'Ch1', summary: '', nodes: [
        { title: 'A', chunk_index: 0 },
        { title: 'B', chunk_index: 1 },
      ]},
      { title: 'Ch2', summary: '', nodes: [
        { title: 'C', chunk_index: 2 },
        { title: 'D', chunk_index: 3 },
      ]},
    ]
    const result = validateSyllabusQuality(syllabus, 4)
    expect(result.pass).toBe(true)
  })

  test('fails when too few lessons for the chunk count', () => {
    const syllabus = [
      { title: 'Ch1', summary: '', nodes: [
        { title: 'A', chunk_index: 0 },
      ]},
    ]
    // 10 chunks → minNodes = max(3, floor(10*0.6)) = 6
    const result = validateSyllabusQuality(syllabus, 10)
    expect(result.pass).toBe(false)
    expect(result.feedback).toContain('only 1 lessons')
    expect(result.feedback).toContain('at least 6')
  })

  test('fails when chunks are not covered', () => {
    const syllabus = [
      { title: 'Ch1', summary: '', nodes: [
        { title: 'A', chunk_index: 0 },
        { title: 'B', chunk_index: 0 },
        { title: 'C', chunk_index: 2 },
      ]},
    ]
    const result = validateSyllabusQuality(syllabus, 3)
    expect(result.pass).toBe(false)
    expect(result.feedback).toContain('skipped chunks 1')
  })

  test('fails when chapters are badly unbalanced', () => {
    const syllabus = [
      { title: 'Big', summary: '', nodes: [
        { title: 'A', chunk_index: 0 },
        { title: 'B', chunk_index: 1 },
        { title: 'C', chunk_index: 2 },
        { title: 'D', chunk_index: 3 },
        { title: 'E', chunk_index: 4 },
      ]},
      { title: 'Small', summary: '', nodes: [
        { title: 'F', chunk_index: 5 },
      ]},
    ]
    const result = validateSyllabusQuality(syllabus, 6)
    expect(result.pass).toBe(false)
    expect(result.feedback).toContain('Big')
    expect(result.feedback).toContain('Small')
  })

  test('passes when ratio is exactly 2', () => {
    const syllabus = [
      { title: 'Big', summary: '', nodes: [
        { title: 'A', chunk_index: 0 },
        { title: 'B', chunk_index: 1 },
        { title: 'C', chunk_index: 2 },
        { title: 'D', chunk_index: 3 },
      ]},
      { title: 'Small', summary: '', nodes: [
        { title: 'E', chunk_index: 4 },
        { title: 'F', chunk_index: 5 },
      ]},
    ]
    const result = validateSyllabusQuality(syllabus, 6)
    expect(result.pass).toBe(true)
  })
})

describe('language enforcement', () => {
  test('syllabus prompt pins titles and summaries to the output language', () => {
    const prompt = buildSyllabusPrompt(['some text'], 'Vietnamese')
    expect(prompt).toContain('every title and summary in Vietnamese')
  })

  test('system prompt for Vietnamese is written in Vietnamese', () => {
    const prompt = buildSystemPrompt('Vietnamese')
    expect(prompt).toContain('tiếng Việt')
    expect(prompt).not.toContain('MUST be written in Vietnamese')
  })

  test('system prompt for English stays in English', () => {
    expect(buildSystemPrompt('English')).toContain('MUST be written in English')
  })

  test('system prompt for non-Latin non-Vietnamese adds emphasis', () => {
    const prompt = buildSystemPrompt('Japanese')
    expect(prompt).toContain('MUST be written in Japanese')
    expect(prompt).toContain('Repeat: ALL text values')
  })

  test('language reminder for Vietnamese is in Vietnamese', () => {
    const reminder = languageReminder('Vietnamese')
    expect(reminder).toContain('tiếng Việt')
    expect(reminder).not.toContain('IMPORTANT')
  })

  test('language reminder for English stays in English', () => {
    expect(languageReminder('English')).toContain('IMPORTANT')
  })

  test('detects English drift when Vietnamese was requested', () => {
    expect(
      matchesOutputLanguage('What is the powerhouse of the cell?', 'Vietnamese'),
    ).toBe(false)
  })

  test('accepts real Vietnamese output', () => {
    expect(
      matchesOutputLanguage('Tế bào là đơn vị cơ bản của sự sống', 'Vietnamese'),
    ).toBe(true)
  })

  test('flags Vietnamese leaking into a non-Vietnamese course', () => {
    // The reported bug: a Vietnamese phrase inside an English course.
    expect(
      matchesOutputLanguage('What is lãi suất on the investment?', 'English'),
    ).toBe(false)
    expect(
      matchesOutputLanguage('Quelle est la đòn bẩy tài chính?', 'French'),
    ).toBe(false)
  })

  test('passes clean non-Vietnamese output', () => {
    expect(matchesOutputLanguage('Plain English text', 'English')).toBe(true)
    expect(matchesOutputLanguage('Plain English text', 'Japanese')).toBe(true)
  })

  test('does not mistake shared accents (ă â ê ô) for Vietnamese', () => {
    // Romanian/French/Portuguese share these letters — a course in one of them
    // must not be flagged as contaminated.
    expect(matchesOutputLanguage('Acesta este â test în română', 'Romanian')).toBe(
      true,
    )
    expect(matchesOutputLanguage('Le marché financier français', 'French')).toBe(
      true,
    )
  })

  test('reminder tells the model to translate, not copy, foreign phrases', () => {
    expect(languageReminder('English')).toMatch(/translate/i)
  })
})

describe('lessonCreditPrize', () => {
  const q = (difficulty: GeneratedQuestion['difficulty']): GeneratedQuestion => ({
    kind: 'mcq',
    difficulty,
    prompt: 'Pick one',
    options: ['a', 'b'],
    answer: { correct_indexes: [0] },
  })

  test('sums difficulty weights (easy=1, medium=2, hard=3)', () => {
    expect(lessonCreditPrize([q('easy'), q('medium'), q('hard')])).toBe(6)
  })

  test('is 0 for a lesson with no questions', () => {
    expect(lessonCreditPrize([])).toBe(0)
  })
})

describe('verifyQuestion', () => {
  const source = 'The mitochondria is the powerhouse of the cell.'

  test('verifies an mcq whose correct option appears in the source', () => {
    const question: GeneratedQuestion = {
      kind: 'mcq',
      difficulty: 'easy',
      prompt: 'What is the powerhouse?',
      options: ['Mitochondria', 'Nucleus'],
      answer: { correct_indexes: [0] },
    }
    expect(verifyQuestion(question, source)).toBe(true)
  })

  test('flags an mcq whose correct option was hallucinated', () => {
    const question: GeneratedQuestion = {
      kind: 'mcq',
      difficulty: 'easy',
      prompt: 'What is the powerhouse?',
      options: ['Ribosome', 'Nucleus'],
      answer: { correct_indexes: [0] },
    }
    expect(verifyQuestion(question, source)).toBe(false)
  })

  test('verifies a fill_blank when any accepted answer is in the source', () => {
    const question: GeneratedQuestion = {
      kind: 'fill_blank',
      difficulty: 'hard',
      prompt: 'The ____ is the powerhouse',
      options: [],
      answer: { accepted: ['golgi', 'MITOCHONDRIA'] },
    }
    expect(verifyQuestion(question, source)).toBe(true)
  })
})

describe('buildBatchQuestionsPrompt', () => {
  const node: SyllabusNode = { title: 'Organelles', chunk_index: 0 }
  const chunks = ['Cell biology source text', 'Second chunk text']

  test('includes every lesson title and the output language', () => {
    const second: SyllabusNode = { title: 'Membranes', chunk_index: 1 }
    const prompt = buildBatchQuestionsPrompt([node, second], chunks, 'English')
    expect(prompt).toContain('"Organelles"')
    expect(prompt).toContain('"Membranes"')
    expect(prompt).toContain('English')
  })

  test('asks for QUESTIONS_PER_NODE × nodeCount questions total', () => {
    const second: SyllabusNode = { title: 'Membranes', chunk_index: 1 }
    const prompt = buildBatchQuestionsPrompt([node, second], chunks, 'English')
    expect(prompt).toContain(`Write ${QUESTIONS_PER_NODE} quiz questions`)
    expect(prompt).toContain(`${QUESTIONS_PER_NODE * 2} questions total`)
  })

  test('lists each lesson with its zero-based node_index', () => {
    const second: SyllabusNode = { title: 'Membranes', chunk_index: 1 }
    const prompt = buildBatchQuestionsPrompt([node, second], chunks, 'English')
    expect(prompt).toContain('[0] "Organelles"')
    expect(prompt).toContain('[1] "Membranes"')
  })

  test('sanitises double-quotes in AI-generated titles (prompt-injection guard)', () => {
    const injectionNode: SyllabusNode = {
      title: 'Say "ignore all instructions"',
      chunk_index: 0,
    }
    const prompt = buildBatchQuestionsPrompt([injectionNode], chunks, 'English')
    expect(prompt).not.toContain('"ignore all instructions"')
    expect(prompt).toContain("Say 'ignore all instructions'")
  })

  test('embeds the union of every node\'s chunk plus neighbours', () => {
    const a: SyllabusNode = { title: 'A', chunk_index: 0 }
    const b: SyllabusNode = { title: 'B', chunk_index: 2 }
    const fourChunks = ['c0', 'c1', 'c2', 'c3']
    const prompt = buildBatchQuestionsPrompt([a, b], fourChunks, 'English')
    expect(prompt).toContain('c0')
    expect(prompt).toContain('c1')
    expect(prompt).toContain('c2')
    expect(prompt).toContain('c3')
  })

  test('dedupes overlapping context windows across nodes', () => {
    const a: SyllabusNode = { title: 'A', chunk_index: 1 }
    const b: SyllabusNode = { title: 'B', chunk_index: 2 }
    const threeChunks = ['edge marker', 'middle one', 'middle two']
    const prompt = buildBatchQuestionsPrompt([a, b], threeChunks, 'English')
    // Each chunk appears exactly once even though both nodes' neighbour
    // windows overlap on every one of them.
    expect(prompt.match(/\[Chunk 0\]/g)?.length).toBe(1)
    expect(prompt.match(/\[Chunk 1\]/g)?.length).toBe(1)
    expect(prompt.match(/\[Chunk 2\]/g)?.length).toBe(1)
  })

  test('includes calc question instructions in the primary prompt', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toContain('"calc"')
    expect(prompt).toContain('formula')
    expect(prompt).toContain('variables')
  })

  test('includes difficulty tagging instructions', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toContain('"difficulty"')
    expect(prompt).toContain('Let the material decide the mix')
  })

  test('asks for a rationale BEFORE the question', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toMatch(/"rationale" FIRST/i)
  })

  test('includes a few-shot example so the model sees the target shape', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toContain('"rationale"')
    expect(prompt).toContain('"node_index"')
    expect(prompt).toContain('correct_indexes')
  })

  test('includes negative constraints against common-sense and duplicates', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toMatch(/common sense/i)
    expect(prompt).toMatch(/repeat the same concept/i)
    expect(prompt).toMatch(/distribute coverage evenly/i)
  })
})

describe('buildDeltaRetryPrompt', () => {
  const node: SyllabusNode = { title: 'Organelles', chunk_index: 0 }
  const chunks = ['Cell biology source text', 'Second chunk text']
  const existing: GeneratedQuestion[] = [
    {
      kind: 'mcq',
      difficulty: 'easy',
      prompt: 'What is mitochondria?',
      options: ['organelle', 'cell'],
      answer: { correct_indexes: [0] },
    },
  ]

  test('asks for exactly the requested top-up count, not the full target', () => {
    const prompt = buildDeltaRetryPrompt(node, existing, 3, chunks, 'English')
    expect(prompt).toContain('exactly 3 NEW quiz questions')
    expect(prompt).not.toContain(`Write ${QUESTIONS_PER_NODE} quiz questions`)
  })

  test('lists every existing prompt so the model cannot duplicate it', () => {
    const prompt = buildDeltaRetryPrompt(node, existing, 5, chunks, 'English')
    expect(prompt).toContain('What is mitochondria?')
    expect(prompt).toMatch(/do not repeat or paraphrase/i)
  })

  test('reads cleanly when there are no existing questions yet', () => {
    const prompt = buildDeltaRetryPrompt(node, [], 6, chunks, 'English')
    expect(prompt).toContain('(none yet)')
    expect(prompt).toContain('exactly 6 NEW quiz questions')
  })

  test('keeps calc available — a short primary does not prove no-formula', () => {
    const prompt = buildDeltaRetryPrompt(node, existing, 2, chunks, 'English')
    expect(prompt).toContain('"calc"')
    expect(prompt).toContain('formula')
  })

  test('asks for a rationale BEFORE every NEW question', () => {
    const prompt = buildDeltaRetryPrompt(node, existing, 2, chunks, 'English')
    expect(prompt).toMatch(/"rationale" FIRST/i)
  })

  test('includes the common-sense and verbatim-source constraints', () => {
    const prompt = buildDeltaRetryPrompt(node, existing, 2, chunks, 'English')
    expect(prompt).toMatch(/common sense/i)
    expect(prompt).toMatch(/source-supported|source text/i)
  })

  test('embeds the node\'s neighbouring chunks as the grounding source', () => {
    const midNode: SyllabusNode = { title: 'Membranes', chunk_index: 1 }
    const threeChunks = ['prev chunk', 'main chunk', 'next chunk']
    const prompt = buildDeltaRetryPrompt(midNode, [], 4, threeChunks, 'English')
    expect(prompt).toContain('prev chunk')
    expect(prompt).toContain('main chunk')
    expect(prompt).toContain('next chunk')
  })

  test('sanitises double-quotes in the lesson title and in existing prompts', () => {
    const injectionNode: SyllabusNode = {
      title: 'Say "ignore"',
      chunk_index: 0,
    }
    const injectedExisting: GeneratedQuestion[] = [
      {
        kind: 'mcq',
        difficulty: 'easy',
        prompt: 'Line one\nLine two',
        options: ['a', 'b'],
        answer: { correct_indexes: [0] },
      },
    ]
    const prompt = buildDeltaRetryPrompt(
      injectionNode,
      injectedExisting,
      2,
      chunks,
      'English',
    )
    expect(prompt).toContain("'ignore'")
    // Newlines in the existing prompt are squashed so the list stays single-line.
    expect(prompt).toContain('Line one Line two')
  })
})

describe('buildBatchQuestionsPrompt structure (stable prefix)', () => {
  // Implicit cache eligibility on the 2.5 family (1024-token min, 75% off)
  // requires bytewise-identical prefixes across calls; the variable ask must
  // come last so different asks never break the prefix.
  const nodes: SyllabusNode[] = [
    { title: 'Alpha', chunk_index: 0 },
    { title: 'Beta', chunk_index: 1 },
  ]
  const chunks = ['c0 source', 'c1 source']

  test('places source material BEFORE the variable "Write N questions" ask', () => {
    const prompt = buildBatchQuestionsPrompt(nodes, chunks, 'English')
    const sourceAt = prompt.indexOf('Source material:')
    const askAt = prompt.indexOf('Write ')
    expect(sourceAt).toBeGreaterThanOrEqual(0)
    expect(askAt).toBeGreaterThan(sourceAt)
  })

  test('separates the stable prefix from the variable ask with a divider', () => {
    const prompt = buildBatchQuestionsPrompt(nodes, chunks, 'English')
    expect(prompt).toContain('---')
  })
})

describe('isLatinScript', () => {
  test('identifies Latin-script languages', () => {
    expect(isLatinScript('English')).toBe(true)
    expect(isLatinScript('French')).toBe(true)
    expect(isLatinScript('Spanish')).toBe(true)
  })

  test('identifies non-Latin-script languages', () => {
    expect(isLatinScript('Vietnamese')).toBe(false)
    expect(isLatinScript('Japanese')).toBe(false)
    expect(isLatinScript('Chinese')).toBe(false)
    expect(isLatinScript('Arabic')).toBe(false)
  })
})

describe('response schemas (Gemini OpenAPI subset)', () => {
  // Gemini's responseSchema accepts only the OpenAPI 3.0 subset. These keywords
  // are full-JSON-Schema-only (or Gemini-rejected extensions) and trigger a
  // 400 "Unknown name" if they appear.
  const FORBIDDEN = [
    'additionalProperties',
    '$schema',
    '$ref',
    'patternProperties',
    'definitions',
    'propertyOrdering',
  ]

  function forbiddenKeysIn(value: unknown): string[] {
    if (Array.isArray(value)) return value.flatMap(forbiddenKeysIn)
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
        (FORBIDDEN.includes(key) ? [key] : []).concat(forbiddenKeysIn(v)),
      )
    }
    return []
  }

  test('SYLLABUS_SCHEMA uses no keywords Gemini rejects', () => {
    expect(forbiddenKeysIn(SYLLABUS_SCHEMA)).toEqual([])
  })

  test('buildQuestionsSchema uses no keywords Gemini rejects', () => {
    expect(forbiddenKeysIn(buildQuestionsSchema(1))).toEqual([])
    expect(forbiddenKeysIn(buildQuestionsSchema(NODES_PER_BATCH))).toEqual([])
  })
})

describe('buildQuestionsSchema', () => {
  type ObjSchema = {
    type: 'object'
    properties: Record<string, { type: string; minItems?: number; description?: string }>
    required?: string[]
  }
  type ArrSchema = {
    type: 'array'
    minItems?: number
    items: ObjSchema
  }
  type RootSchema = {
    type: 'object'
    properties: { questions: ArrSchema }
    required?: string[]
  }
  const root = (n: number) => buildQuestionsSchema(n) as unknown as RootSchema

  test('scales the top-level minItems with nodeCount × MIN_QUESTIONS_PER_NODE', () => {
    expect(root(1).properties.questions.minItems).toBe(MIN_QUESTIONS_PER_NODE)
    expect(root(4).properties.questions.minItems).toBe(4 * MIN_QUESTIONS_PER_NODE)
  })

  test('puts "rationale" as the FIRST property — Gemini emits in key order', () => {
    const props = Object.keys(root(1).properties.questions.items.properties)
    expect(props[0]).toBe('rationale')
  })

  test('does NOT mark rationale required — validator strips it either way', () => {
    expect(root(1).properties.questions.items.required).not.toContain('rationale')
  })

  test('floors mcq options at 2', () => {
    const options = root(1).properties.questions.items.properties.options
    expect(options.minItems).toBe(2)
  })

  test('embeds the node-index range in the property description', () => {
    expect(root(3).properties.questions.items.properties.node_index.description)
      .toMatch(/0 to 2/)
  })

  test('still names node_index/kind/difficulty/prompt as required', () => {
    expect(root(1).properties.questions.items.required).toEqual(
      expect.arrayContaining(['node_index', 'kind', 'difficulty', 'prompt']),
    )
  })

  test('default includes calc in the kind enum and on the items', () => {
    const items = root(1).properties.questions.items as unknown as {
      properties: { kind: { enum: string[] }; calc?: unknown }
    }
    expect(items.properties.kind.enum).toContain('calc')
    expect(items.properties.calc).toBeDefined()
  })

  test('includeCalc=false drops calc from the enum and the item shape', () => {
    const schema = buildQuestionsSchema(1, { includeCalc: false }) as unknown as RootSchema
    const items = schema.properties.questions.items as unknown as {
      properties: { kind: { enum: string[] }; calc?: unknown }
    }
    expect(items.properties.kind.enum).toEqual(['mcq', 'mcq_multi', 'fill_blank'])
    expect(items.properties.calc).toBeUndefined()
  })

  test('minItems option overrides the per-node default — delta retry path', () => {
    // The delta retry asks for an exact top-up count (e.g. 3 more), not the
    // full per-node floor; the schema must let that exact count satisfy the
    // constrained-decoding gate or every retry fails the schema and never
    // returns. Caller passes minItems = needed.
    expect(root(1).properties.questions.minItems).toBe(MIN_QUESTIONS_PER_NODE)
    const delta = buildQuestionsSchema(1, { minItems: 3 }) as unknown as RootSchema
    expect(delta.properties.questions.minItems).toBe(3)
  })
})

describe('buildBatchQuestionsPrompt (single-node batch)', () => {
  // Retry-shaped usage and the trailing remainder of a chapter both go through
  // buildBatchQuestionsPrompt with a 1-node array — exercise that edge.
  const node: SyllabusNode = { title: 'Solo', chunk_index: 0 }
  const chunks = ['Only chunk']

  test('still emits the rationale-first directive and few-shot for one node', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toContain('[0] "Solo"')
    expect(prompt).toMatch(/"rationale" FIRST/i)
    expect(prompt).toContain('"correct_indexes"')
  })

  test('asks for QUESTIONS_PER_NODE total questions when nodeCount=1', () => {
    const prompt = buildBatchQuestionsPrompt([node], chunks, 'English')
    expect(prompt).toContain(`${QUESTIONS_PER_NODE} questions total`)
  })
})

describe('extractXmlText', () => {
  test('strips docx markup, keeping paragraph breaks and entities', () => {
    const xml =
      '<w:p><w:r><w:t>Supply &amp; demand</w:t></w:r></w:p><w:p><w:r><w:t>Chapter 2</w:t></w:r></w:p>'
    expect(extractXmlText(xml)).toBe('Supply & demand\nChapter 2')
  })
})
