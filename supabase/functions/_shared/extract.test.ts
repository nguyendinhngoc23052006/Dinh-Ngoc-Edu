import { zipSync } from 'fflate'
import { describe, expect, test } from 'vitest'
import { MAX_FILE_BYTES, extractFileText } from './extract.ts'

const encode = (text: string) => new TextEncoder().encode(text)

const docxBytes = (documentXml: string) =>
  zipSync({ 'word/document.xml': encode(documentXml) })

const pptxBytes = (slides: Record<string, string>) =>
  zipSync(
    Object.fromEntries(
      Object.entries(slides).map(([name, xml]) => [
        `ppt/slides/${name}`,
        encode(xml),
      ]),
    ),
  )

describe('extractFileText', () => {
  test('returns txt and md bytes decoded as-is', async () => {
    expect(await extractFileText('notes.txt', encode('plain text'))).toBe(
      'plain text',
    )
    expect(await extractFileText('notes.md', encode('# heading'))).toBe(
      '# heading',
    )
  })

  test('rejects unsupported extensions with a readable error', async () => {
    await expect(extractFileText('image.png', encode('x'))).rejects.toThrow(
      'Unsupported file type: image.png',
    )
  })

  test('extracts paragraph text from a docx document.xml', async () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Hello</w:t></w:r>' +
      '<w:r><w:t> world</w:t></w:r></w:p></w:body></w:document>'
    expect(await extractFileText('doc.docx', docxBytes(xml))).toContain(
      'Hello world',
    )
  })

  test('extracts pptx slides in numeric order (slide10 after slide2)', async () => {
    const slide = (text: string) => `<p:sld><a:t>${text}</a:t></p:sld>`
    const text = await extractFileText(
      'deck.pptx',
      pptxBytes({
        'slide10.xml': slide('ten'),
        'slide2.xml': slide('two'),
        'slide1.xml': slide('one'),
      }),
    )
    expect(text.indexOf('one')).toBeLessThan(text.indexOf('two'))
    expect(text.indexOf('two')).toBeLessThan(text.indexOf('ten'))
  })

  test('ignores zip entries that are not slides', async () => {
    const bytes = zipSync({
      'ppt/slides/slide1.xml': encode('<a:t>real</a:t>'),
      'ppt/notesSlides/notesSlide1.xml': encode('<a:t>notes</a:t>'),
      'docProps/core.xml': encode('<a:t>meta</a:t>'),
    })
    const text = await extractFileText('deck.pptx', bytes)
    expect(text).toContain('real')
    expect(text).not.toContain('notes')
    expect(text).not.toContain('meta')
  })

  test('blocks zip bombs: rejects archives inflating past 4x the bucket cap', async () => {
    // Highly compressible payload: tiny on disk, huge unzipped.
    const huge = new Uint8Array(4 * MAX_FILE_BYTES + 1)
    const bytes = zipSync({ 'word/document.xml': huge })
    expect(bytes.length).toBeLessThan(MAX_FILE_BYTES)
    await expect(extractFileText('bomb.docx', bytes)).rejects.toThrow(
      'decompresses far beyond its file size',
    )
  })

  test('a pdf with no extractable text fails with the re-export guidance', async () => {
    await expect(
      extractFileText('scan.pdf', encode('not a real pdf')),
    ).rejects.toThrow('re-export it as a text-based PDF')
  })
})
