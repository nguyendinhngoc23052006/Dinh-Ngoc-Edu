import { describe, expect, test } from 'vitest'
import {
  buildChapterQuestionsPrompt,
  chunkText,
  extractXmlText,
  parseJsonLoose,
  validateChapterQuestions,
  validateQuestions,
  validateSyllabus,
  verifyQuestion,
} from './pipeline'
import type { GeneratedQuestion } from './pipeline'

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

describe('validateQuestions', () => {
  test('keeps only questions matching the database contract', () => {
    const questions = validateQuestions({
      questions: [
        {
          kind: 'mcq',
          prompt: 'Pick one',
          options: ['a', 'b', 'c'],
          correct_indexes: [1],
        },
        {
          kind: 'mcq_multi',
          prompt: 'Pick many',
          options: ['a', 'b'],
          correct_indexes: [1, 0, 0],
        },
        { kind: 'fill_blank', prompt: 'The ____ rises', accepted: ['sun'] },
        // All of the below are malformed and must be dropped:
        {
          kind: 'mcq',
          prompt: 'Two correct',
          options: ['a', 'b'],
          correct_indexes: [0, 1],
        },
        {
          kind: 'mcq',
          prompt: 'Index out of range',
          options: ['a', 'b'],
          correct_indexes: [5],
        },
        {
          kind: 'mcq',
          prompt: 'One option',
          options: ['a'],
          correct_indexes: [0],
        },
        { kind: 'fill_blank', prompt: 'No answers', accepted: [] },
        { kind: 'essay', prompt: 'Unknown kind' },
        { kind: 'mcq', prompt: '', options: ['a', 'b'], correct_indexes: [0] },
      ],
    })
    expect(questions).toEqual([
      {
        kind: 'mcq',
        prompt: 'Pick one',
        options: ['a', 'b', 'c'],
        answer: { correct_indexes: [1] },
      },
      {
        kind: 'mcq_multi',
        prompt: 'Pick many',
        options: ['a', 'b'],
        answer: { correct_indexes: [0, 1] },
      },
      {
        kind: 'fill_blank',
        prompt: 'The ____ rises',
        options: [],
        answer: { accepted: ['sun'] },
      },
    ])
  })

  test('returns empty for non-list values instead of failing the course', () => {
    expect(validateQuestions('garbage')).toEqual([])
  })
})

describe('validateChapterQuestions', () => {
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

describe('buildChapterQuestionsPrompt', () => {
  const chapter = {
    title: 'Cells',
    summary: 'Cell basics.',
    nodes: [
      { title: 'Organelles', chunk_index: 0 },
      { title: 'Membranes', chunk_index: 0 },
      { title: 'Energy', chunk_index: 1 },
    ],
  }

  test('lists every lesson with its node_index and includes each chunk once', () => {
    const prompt = buildChapterQuestionsPrompt(
      chapter,
      ['chunk zero text', 'chunk one text'],
      'English',
    )
    expect(prompt).toContain('0: "Organelles"')
    expect(prompt).toContain('2: "Energy"')
    expect(prompt).toContain('node_index')
    // Two nodes share chunk 0; it must appear only once.
    expect(prompt.match(/chunk zero text/g)).toHaveLength(1)
    expect(prompt).toContain('chunk one text')
  })
})

describe('verifyQuestion', () => {
  const source = 'The mitochondria is the powerhouse of the cell.'

  test('verifies an mcq whose correct option appears in the source', () => {
    const question: GeneratedQuestion = {
      kind: 'mcq',
      prompt: 'What is the powerhouse?',
      options: ['Mitochondria', 'Nucleus'],
      answer: { correct_indexes: [0] },
    }
    expect(verifyQuestion(question, source)).toBe(true)
  })

  test('flags an mcq whose correct option was hallucinated', () => {
    const question: GeneratedQuestion = {
      kind: 'mcq',
      prompt: 'What is the powerhouse?',
      options: ['Ribosome', 'Nucleus'],
      answer: { correct_indexes: [0] },
    }
    expect(verifyQuestion(question, source)).toBe(false)
  })

  test('verifies a fill_blank when any accepted answer is in the source', () => {
    const question: GeneratedQuestion = {
      kind: 'fill_blank',
      prompt: 'The ____ is the powerhouse',
      options: [],
      answer: { accepted: ['golgi', 'MITOCHONDRIA'] },
    }
    expect(verifyQuestion(question, source)).toBe(true)
  })
})

describe('extractXmlText', () => {
  test('strips docx markup, keeping paragraph breaks and entities', () => {
    const xml =
      '<w:p><w:r><w:t>Supply &amp; demand</w:t></w:r></w:p><w:p><w:r><w:t>Chapter 2</w:t></w:r></w:p>'
    expect(extractXmlText(xml)).toBe('Supply & demand\nChapter 2')
  })
})
