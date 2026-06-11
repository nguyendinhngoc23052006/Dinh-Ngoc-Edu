// Pure helpers for the generate-course pipeline: chunking, prompt building,
// JSON parsing, format enforcement, and answer verification. No Deno or
// network imports, so the sandbox unit tests (vitest) exercise them directly.

export const MAX_CHAPTERS = 8
export const MAX_NODES_PER_CHAPTER = 5
export const QUESTIONS_PER_NODE = 4
const MAX_QUESTIONS_PER_NODE = 8
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

export interface GeneratedQuestion {
  kind: 'mcq' | 'mcq_multi' | 'fill_blank'
  prompt: string
  options: string[]
  answer: { correct_indexes?: number[]; accepted?: string[] }
}

// Slices the extracted text into model-sized chunks on paragraph boundaries.
// The syllabus step assigns each node a chunk_index, and the question step
// sends only that chunk back — that's how a long upload fits a small model.
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

// Models wrap JSON in prose or code fences; pull out the first JSON value.
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

// Format enforcement for step 1: keep only well-formed chapters/nodes, cap
// sizes, and clamp every chunk_index into range.
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

// Format enforcement for step 2: drop anything that does not match the
// database contract exactly (kind, options, answer key shape).
export function validateQuestions(value: unknown): GeneratedQuestion[] {
  const root =
    value && typeof value === 'object' && 'questions' in value
      ? (value as { questions: unknown }).questions
      : value
  if (!Array.isArray(root)) return []
  const questions: GeneratedQuestion[] = []
  for (const entry of root.slice(0, MAX_QUESTIONS_PER_NODE)) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : ''
    if (!prompt) continue
    if (raw.kind === 'fill_blank') {
      const accepted = (Array.isArray(raw.accepted) ? raw.accepted : [])
        .filter((a): a is string => typeof a === 'string' && a.trim() !== '')
        .map((a) => a.trim())
        .slice(0, 10)
      if (accepted.length === 0) continue
      questions.push({
        kind: 'fill_blank',
        prompt,
        options: [],
        answer: { accepted },
      })
      continue
    }
    if (raw.kind !== 'mcq' && raw.kind !== 'mcq_multi') continue
    const options = (Array.isArray(raw.options) ? raw.options : [])
      .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      .map((o) => o.trim())
      .slice(0, MAX_OPTIONS)
    if (options.length < 2) continue
    const correct = [
      ...new Set(
        (Array.isArray(raw.correct_indexes) ? raw.correct_indexes : [])
          .filter((i): i is number => typeof i === 'number')
          .map((i) => Math.floor(i)),
      ),
    ].filter((i) => i >= 0 && i < options.length)
    if (raw.kind === 'mcq' && correct.length !== 1) continue
    if (raw.kind === 'mcq_multi' && correct.length === 0) continue
    questions.push({
      kind: raw.kind,
      prompt,
      options,
      answer: { correct_indexes: correct.sort((a, b) => a - b) },
    })
  }
  return questions
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Step 4 hallucination check: a question is 'verified' only when its correct
// answer literally appears in the source chunk it was generated from.
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

// docx/pptx text lives inside XML; strip the markup, keeping paragraph breaks.
export function extractXmlText(xml: string): string {
  return xml
    .replace(/<\/(?:w:p|a:p)>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim()
}

export function buildSyllabusPrompt(
  chunks: string[],
  outputLanguage: string,
): string {
  const excerpts = chunks
    .map((chunk, index) => `[Chunk ${index}]\n${chunk.slice(0, 1800)}`)
    .join('\n\n')
  return [
    `You are designing a study course in ${outputLanguage} from a student's uploaded materials.`,
    `The materials were split into ${chunks.length} chunks, excerpted below.`,
    `Design a syllabus: at most ${MAX_CHAPTERS} chapters, each with 2-${MAX_NODES_PER_CHAPTER} short lessons ("nodes").`,
    `Each node names the chunk (by index) its content comes from.`,
    `Respond with ONLY this JSON, all text in ${outputLanguage}:`,
    `{"chapters":[{"title":"...","summary":"one sentence","nodes":[{"title":"...","chunk_index":0}]}]}`,
    '',
    excerpts,
  ].join('\n')
}

export function buildQuestionsPrompt(
  chapterTitle: string,
  nodeTitle: string,
  chunk: string,
  outputLanguage: string,
): string {
  return [
    `Write exactly ${QUESTIONS_PER_NODE} quiz questions in ${outputLanguage} for the lesson "${nodeTitle}" (chapter "${chapterTitle}").`,
    `Base every question and answer ONLY on the source text below — never invent facts.`,
    `Mix the kinds: "mcq" (one correct option), "mcq_multi" (several correct options), "fill_blank" (the student types a missing word or phrase).`,
    `For mcq/mcq_multi give 3-4 options and the correct option indexes. For fill_blank give the accepted answers (short, copied from the source) and no options.`,
    `Respond with ONLY this JSON:`,
    `{"questions":[{"kind":"mcq","prompt":"...","options":["...","..."],"correct_indexes":[0]},{"kind":"fill_blank","prompt":"... ____ ...","accepted":["..."]}]}`,
    '',
    `Source text:`,
    chunk.slice(0, 8000),
  ].join('\n')
}
