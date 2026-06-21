// Pure helpers for the generate-course pipeline: chunking, prompt building,
// JSON parsing, format enforcement, and answer verification. No Deno or
// network imports, so the sandbox unit tests (vitest) exercise them directly.

export const MAX_CHAPTERS = 8
export const MAX_NODES_PER_CHAPTER = 5
// Target questions per lesson. Small enough that a single Gemini call
// reliably produces them without tripping structured-output truncation —
// the previous chapter-batch shape asked for 50 questions in one call and
// failed silently when Gemini couldn't satisfy responseSchema.minItems.
export const QUESTIONS_PER_NODE = 6
// Acceptance floor: a lesson with fewer than this many usable questions
// after the first call gets ONE focused retry for the missing count.
export const MIN_QUESTIONS_PER_NODE = 4
const MAX_QUESTIONS_PER_NODE = 10
const MAX_OPTIONS = 6

export interface SyllabusNode {
  title: string
  chunk_index: number
}

export interface SyllabusChapter {
  title: string
  summary: string
  nodes: SyllabusNode[]
}

export type Difficulty = 'easy' | 'medium' | 'hard'

// The three kinds the AI generates from source. `calc` rows still exist in the
// database (seed + clones + older courses) and the UI keeps rendering them,
// but fresh AI generation no longer produces calc — its formula/variables
// schema was the heaviest part of the structured-output ask and rarely fit
// real source material.
export interface GeneratedQuestion {
  kind: 'mcq' | 'mcq_multi' | 'fill_blank'
  difficulty: Difficulty
  prompt: string
  options: string[]
  answer: { correct_indexes?: number[]; accepted?: string[] }
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
function toDifficulty(value: unknown): Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as Difficulty)
    : 'medium'
}

// A lesson's credit prize is the sum of its questions' difficulty weights —
// the AI's per-question difficulty calls roll up into how much a flawless run
// is worth, so harder lessons pay more.
const DIFFICULTY_WEIGHT: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 }
export function lessonCreditPrize(questions: GeneratedQuestion[]): number {
  return questions.reduce((sum, q) => sum + DIFFICULTY_WEIGHT[q.difficulty], 0)
}

// Each node carries a chunk_index from the syllabus step so the question step
// can send back only that chunk — that's how a long upload fits a small model.
export function chunkText(
  text: string,
  maxChars = 6000,
  maxChunks = 30,
): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (!clean) return []
  const chunks: string[] = []
  let current = ''
  for (const paragraph of clean.split(/\n{2,}/)) {
    const part = paragraph.trim()
    if (!part) continue
    if (part.length > maxChars) {
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < part.length; i += maxChars) {
        chunks.push(part.slice(i, i + maxChars))
      }
      continue
    }
    if (current.length + part.length + 2 > maxChars) {
      chunks.push(current)
      current = part
    } else {
      current = current ? `${current}\n\n${part}` : part
    }
  }
  if (current) chunks.push(current)
  return chunks.slice(0, maxChunks)
}

// Models occasionally wrap JSON in prose or code fences despite the
// responseMimeType setting — slice from the first `{`/`[` to the last
// `}`/`]` so a stray prefix or suffix doesn't fail the parse.
export function parseJsonLoose(raw: string): unknown {
  const start = raw.search(/[[{]/)
  const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'))
  if (start === -1 || end <= start) {
    throw new Error('The AI returned no JSON.')
  }
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new Error('The AI returned invalid JSON.')
  }
}

export function validateSyllabus(
  value: unknown,
  chunkCount: number,
): SyllabusChapter[] {
  const root =
    value && typeof value === 'object' && 'chapters' in value
      ? (value as { chapters: unknown }).chapters
      : value
  if (!Array.isArray(root)) {
    throw new Error('The syllabus must be a list of chapters.')
  }
  const chapters: SyllabusChapter[] = []
  for (const entry of root.slice(0, MAX_CHAPTERS)) {
    if (!entry || typeof entry !== 'object') continue
    const chapter = entry as Record<string, unknown>
    const title = typeof chapter.title === 'string' ? chapter.title.trim() : ''
    if (!title) continue
    const summary =
      typeof chapter.summary === 'string' ? chapter.summary.trim() : ''
    const nodes: SyllabusNode[] = []
    const rawNodes = Array.isArray(chapter.nodes) ? chapter.nodes : []
    for (const rawNode of rawNodes.slice(0, MAX_NODES_PER_CHAPTER)) {
      if (!rawNode || typeof rawNode !== 'object') continue
      const node = rawNode as Record<string, unknown>
      const nodeTitle = typeof node.title === 'string' ? node.title.trim() : ''
      if (!nodeTitle) continue
      const rawIndex =
        typeof node.chunk_index === 'number' ? Math.floor(node.chunk_index) : 0
      nodes.push({
        title: nodeTitle.slice(0, 200),
        chunk_index: Math.min(Math.max(rawIndex, 0), chunkCount - 1),
      })
    }
    if (nodes.length > 0) {
      chapters.push({
        title: title.slice(0, 200),
        summary: summary.slice(0, 500),
        nodes,
      })
    }
  }
  if (chapters.length === 0) {
    throw new Error('The syllabus had no usable chapters.')
  }
  return chapters
}

// Parses one Gemini answer (initial OR retry for the same lesson) into a flat
// list of validated questions. No node_index, no buckets — each call targets
// exactly one lesson, so we keep at most MAX_QUESTIONS_PER_NODE in order.
export function validateNodeQuestions(value: unknown): GeneratedQuestion[] {
  const root =
    value && typeof value === 'object' && 'questions' in value
      ? (value as { questions: unknown }).questions
      : value
  if (!Array.isArray(root)) return []
  const result: GeneratedQuestion[] = []
  for (const entry of root) {
    if (result.length >= MAX_QUESTIONS_PER_NODE) break
    const question = validateQuestion(entry)
    if (question) result.push(question)
  }
  return result
}

function validateQuestion(entry: unknown): GeneratedQuestion | null {
  if (!entry || typeof entry !== 'object') return null
  const raw = entry as Record<string, unknown>
  // Length caps: AI output is untrusted input — nothing unbounded reaches
  // the database.
  const prompt =
    typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 1000) : ''
  if (!prompt) return null
  const difficulty = toDifficulty(raw.difficulty)
  if (raw.kind === 'fill_blank') {
    const accepted = (Array.isArray(raw.accepted) ? raw.accepted : [])
      .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
      .map((a) => a.trim().slice(0, 300))
      .slice(0, 10)
    if (accepted.length === 0) return null
    return { kind: 'fill_blank', difficulty, prompt, options: [], answer: { accepted } }
  }
  if (raw.kind !== 'mcq' && raw.kind !== 'mcq_multi') return null
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
    .map((o) => o.trim().slice(0, 300))
    .slice(0, MAX_OPTIONS)
  if (options.length < 2) return null
  const correct = [
    ...new Set(
      (Array.isArray(raw.correct_indexes) ? raw.correct_indexes : [])
        .filter((i): i is number => typeof i === 'number')
        .map((i) => Math.floor(i)),
    ),
  ].filter((i) => i >= 0 && i < options.length)
  if (raw.kind === 'mcq' && correct.length !== 1) return null
  if (raw.kind === 'mcq_multi' && correct.length === 0) return null
  return {
    kind: raw.kind,
    difficulty,
    prompt,
    options,
    answer: { correct_indexes: correct.sort((a, b) => a - b) },
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// `verified` flips true only when the correct answer literally appears in
// the source chunk — a cheap hallucination gate on top of the validator.
export function verifyQuestion(
  question: GeneratedQuestion,
  sourceText: string,
): boolean {
  const source = normalize(sourceText)
  if (question.kind === 'fill_blank') {
    const accepted = question.answer.accepted ?? []
    return accepted.some((answer) => source.includes(normalize(answer)))
  }
  const correct = question.answer.correct_indexes ?? []
  return (
    correct.length > 0 &&
    correct.every((index) => {
      const option = question.options[index]
      return option !== undefined && source.includes(normalize(option))
    })
  )
}

const LATIN_LANGUAGES = new Set([
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Dutch', 'Romanian', 'Polish', 'Czech', 'Slovak', 'Hungarian',
  'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Turkish', 'Indonesian',
  'Malay', 'Tagalog', 'Swahili',
])

export function isLatinScript(language: string): boolean {
  return LATIN_LANGUAGES.has(language)
}

export function buildSystemPrompt(outputLanguage: string): string {
  if (outputLanguage === 'Vietnamese') {
    return [
      'Bạn viết nội dung giáo dục bằng tiếng Việt.',
      'Mọi tiêu đề chương, tóm tắt, tiêu đề bài học, câu hỏi, lựa chọn và đáp án PHẢI viết bằng tiếng Việt, dù hướng dẫn bằng tiếng Anh và tài liệu gốc có thể bằng ngôn ngữ khác.',
      'Chỉ danh từ riêng, công thức và thuật ngữ chuyên môn trích nguyên văn từ tài liệu gốc mới được giữ nguyên ngôn ngữ.',
      'Chỉ trả lời bằng JSON — không văn xuôi, không code fence.',
    ].join(' ')
  }
  const base = [
    `You write educational content strictly in ${outputLanguage}.`,
    `Every chapter title, summary, lesson title, question, option, and accepted answer MUST be written in ${outputLanguage}, even though these instructions are in English and even when the source material is in a different language.`,
    `Only proper nouns, formulas, and technical terms quoted verbatim from the source may stay in their original language.`,
    `Respond with JSON only — no prose, no code fences.`,
  ].join(' ')
  if (isLatinScript(outputLanguage)) return base
  return base + ` (Repeat: ALL text values in the JSON must be in ${outputLanguage}.)`
}

export function languageReminder(outputLanguage: string): string {
  if (outputLanguage === 'Vietnamese') {
    return '\n\nQUAN TRỌNG: câu trả lời trước đó của bạn chứa nội dung không phải tiếng Việt. Mọi giá trị PHẢI viết bằng tiếng Việt. Dịch bất kỳ từ hoặc cụm từ nào sang tiếng Việt — không sao chép cụm từ từ tài liệu gốc bằng ngôn ngữ gốc của chúng.'
  }
  return `\n\nIMPORTANT: your previous answer contained text that was not in ${outputLanguage}. Every value must be written in ${outputLanguage}. Translate any word or phrase that is in another language — do not copy phrases from the source material in their original language.`
}

// Characters unique to Vietnamese among Latin-script languages: đ, ơ, ư and the
// tonal-stacked vowels (Latin Extended Additional, U+1EA0–U+1EF9). ă/â/ê/ô are
// deliberately excluded — Romanian, French, and Portuguese use them too, so
// they are not a reliable Vietnamese signal in either direction.
const VIETNAMESE_CHARS = /[đĐơƠưƯẠ-ỹ]/

// Cheap bidirectional post-check for the one language we can detect reliably.
// Vietnamese is the only language with a distinctive character set we can spot,
// so it is the only one we police — but we police it BOTH ways. Mismatch
// triggers the single re-ask in chatInLanguage.
export function matchesOutputLanguage(
  text: string,
  outputLanguage: string,
): boolean {
  const decoded = text.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)),
  )
  const hasVietnamese = VIETNAMESE_CHARS.test(decoded)
  return outputLanguage === 'Vietnamese' ? hasVietnamese : !hasVietnamese
}

export function buildSyllabusPrompt(
  chunks: string[],
  outputLanguage: string,
): string {
  const minNodes = Math.max(3, Math.floor(chunks.length * 0.6))
  const maxNodes = MAX_CHAPTERS * MAX_NODES_PER_CHAPTER
  const excerpts = chunks
    .map((chunk, index) => `[Chunk ${index}]\n${chunk.slice(0, 1500)}`)
    .join('\n\n')
  return [
    `You are designing a study course in ${outputLanguage} from a student's uploaded materials.`,
    `The materials were split into ${chunks.length} chunks, excerpted below.`,
    `Design a syllabus: at most ${MAX_CHAPTERS} chapters, each with 2-${MAX_NODES_PER_CHAPTER} short lessons ("nodes").`,
    `The material has ${chunks.length} chunks — design ${minNodes}-${maxNodes} total lessons, ensuring every chunk is covered by at least one lesson.`,
    `Each node names the chunk (by index) its content comes from.`,
    `Write every title and summary in ${outputLanguage}, regardless of the materials' language.`,
    `Respond with ONLY this JSON:`,
    `{"chapters":[{"title":"...","summary":"one sentence","nodes":[{"title":"...","chunk_index":0}]}]}`,
    '',
    excerpts,
  ].join('\n')
}

export interface SyllabusQualityResult {
  pass: boolean
  feedback: string
}

export function validateSyllabusQuality(
  syllabus: SyllabusChapter[],
  chunkCount: number,
): SyllabusQualityResult {
  const totalNodes = syllabus.reduce((sum, ch) => sum + ch.nodes.length, 0)
  const minNodes = Math.max(3, Math.floor(chunkCount * 0.6))
  const problems: string[] = []

  if (totalNodes < minNodes) {
    problems.push(
      `Your syllabus has only ${totalNodes} lessons for ${chunkCount} chunks of material. Design at least ${minNodes} lessons to cover the content adequately.`,
    )
  }

  const used = new Set(
    syllabus.flatMap((ch) => ch.nodes.map((n) => n.chunk_index)),
  )
  const missed = Array.from({ length: chunkCount }, (_, i) => i).filter(
    (i) => !used.has(i),
  )
  if (missed.length > 0) {
    problems.push(
      `Your syllabus skipped chunks ${missed.join(', ')}. Every chunk contains material that must appear in at least one lesson.`,
    )
  }

  const sizes = syllabus.map((ch) => ch.nodes.length)
  if (sizes.length > 1) {
    const maxSize = Math.max(...sizes)
    const minSize = Math.min(...sizes)
    if (minSize > 0 && maxSize / minSize > 2) {
      const bigIdx = sizes.indexOf(maxSize)
      const smallIdx = sizes.indexOf(minSize)
      const sanitize = (t: string) => t.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
      problems.push(
        `Chapter "${sanitize(syllabus[bigIdx].title)}" has ${maxSize} lessons while "${sanitize(syllabus[smallIdx].title)}" has only ${minSize}. Redistribute more evenly.`,
      )
    }
  }

  return { pass: problems.length === 0, feedback: problems.join('\n') }
}

// The lesson's primary chunk plus its two neighbours, deduped. Capped at 8K
// chars — enough context to ground 6 questions without bloating the call.
function nodeSourceContext(node: SyllabusNode, chunks: string[]): string {
  const ci = Math.min(node.chunk_index, Math.max(0, chunks.length - 1))
  return [chunks[ci - 1], chunks[ci], chunks[ci + 1]]
    .filter((c): c is string => typeof c === 'string')
    .join('\n\n')
    .slice(0, 8_000)
}

const FEW_SHOT_EXAMPLE =
  '{"kind":"mcq","difficulty":"easy","prompt":"What is the defining outcome of mitosis?","options":["Two genetically identical daughter cells","Four haploid gametes","A single polyploid cell","Two cells with halved chromosomes"],"correct_indexes":[0]}'

// One Gemini call per lesson — both for the initial pass and for the retry
// when the first call came back short. The retry mode lists every question
// already accepted so the model cannot duplicate; otherwise the two modes
// share the same source + format spec + few-shot, so Gemini's implicit cache
// (1024-token min, 75% off cached input on the 2.5 family, ~5 min TTL) kicks
// in on the second hit within the same chapter / for the retry of the same
// lesson. Variable ask sits at the END so the prefix stays bytewise identical.
export function buildNodeQuestionsPrompt(
  node: SyllabusNode,
  existing: GeneratedQuestion[],
  count: number,
  chunks: string[],
  outputLanguage: string,
): string {
  const source = nodeSourceContext(node, chunks)
  const safeTitle = node.title.replace(/"/g, "'").replace(/[\r\n]+/g, ' ')
  const lines: string[] = [
    // === STABLE PREFIX (cache-eligible across retries / same chapter) ===
    `Source material:`,
    source,
    ``,
    `Lesson: "${safeTitle}"`,
    ``,
  ]
  if (existing.length > 0) {
    lines.push(
      `Questions that ALREADY exist for this lesson — do not repeat or paraphrase any of them:`,
      ...existing.map(
        (q, i) =>
          `  ${i + 1}. ${q.prompt.replace(/[\r\n]+/g, ' ').slice(0, 200)}`,
      ),
      ``,
    )
  }
  lines.push(
    `For every question:`,
    `- Base the question and answer ONLY on the source text above — never invent facts.`,
    `- Tag "difficulty" as "easy" (recall a stated fact), "medium" (apply or connect ideas), or "hard" (multi-step reasoning). Let the material decide the mix.`,
    `- Write the prompt and every option in ${outputLanguage}.`,
    ``,
    `Use any of these kinds, mixing across the questions:`,
    `- "mcq": one correct option, 3-4 options, give "correct_indexes"`,
    `- "mcq_multi": several correct options, 3-4 options, give "correct_indexes"`,
    `- "fill_blank": student types a missing word/phrase, give "accepted" (copy verbatim from the source)`,
    ``,
    `Constraints:`,
    `- DO NOT write questions answerable by general common sense — every answer must be supported by THIS source text.`,
    existing.length > 0
      ? `- DO NOT duplicate, paraphrase, or invert any existing question above.`
      : `- DO NOT repeat the same concept across questions.`,
    `- DO NOT cluster every question on one paragraph — distribute coverage evenly across the lesson's material.`,
    ``,
    `Example of one well-formed question:`,
    FEW_SHOT_EXAMPLE,
    ``,
    // === VARIABLE SUFFIX ===
    `---`,
    existing.length > 0
      ? `Write exactly ${count} NEW quiz questions in ${outputLanguage} for the lesson above.`
      : `Write ${count} quiz questions in ${outputLanguage} for the lesson above.`,
    `Respond with ONLY this JSON:`,
    `{"questions":[{...},{...}]}`,
  )
  return lines.join('\n')
}

// Gemini's responseSchema accepts only the OpenAPI 3.0 subset — NOT full JSON
// Schema. Stick to type/properties/items/required/enum/description; do NOT add
// `additionalProperties` or `propertyOrdering` (the API 400s on both).
// Deliberately NO `minItems` anywhere — Gemini 2.5 Flash treats it as a hard
// constraint and silently truncates or empties the response when it can't be
// met, which is how the previous chapter-batch shape produced 0 questions on
// real source material. Strictness is enforced after the call by the
// validator, not by the schema.
export const SYLLABUS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          summary: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                chunk_index: { type: 'integer' },
              },
              required: ['title', 'chunk_index'],
            },
          },
        },
        required: ['title', 'summary', 'nodes'],
      },
    },
  },
  required: ['chapters'],
}

export const NODE_QUESTIONS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['mcq', 'mcq_multi', 'fill_blank'],
            description: 'Question kind.',
          },
          difficulty: {
            type: 'string',
            enum: ['easy', 'medium', 'hard'],
            description: 'Cognitive difficulty.',
          },
          prompt: {
            type: 'string',
            description: 'The question text shown to the student.',
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'Answer options for mcq/mcq_multi; omit for fill_blank.',
          },
          correct_indexes: {
            type: 'array',
            items: { type: 'integer' },
            description: 'Zero-based indexes of correct options.',
          },
          accepted: {
            type: 'array',
            items: { type: 'string' },
            description: 'For fill_blank: accepted answer strings, copied verbatim from the source.',
          },
        },
        required: ['kind', 'difficulty', 'prompt'],
      },
    },
  },
  required: ['questions'],
}
