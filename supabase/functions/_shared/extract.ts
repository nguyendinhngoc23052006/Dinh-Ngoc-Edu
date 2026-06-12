// Text extraction from uploaded material files, shared by extract-material
// (runs at upload time) and generate-course (legacy fallback for rows
// uploaded before extraction-at-upload existed).

import { strFromU8, unzipSync } from 'npm:fflate@0.8.2'
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1'
import { extractXmlText } from './xml.ts'

// Mirrors the course-materials bucket's file_size_limit and the client check
// in src/services/materialService.ts.
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
// The bucket limit caps COMPRESSED bytes; a crafted docx/pptx (zip bomb)
// could still inflate to gigabytes in memory without this cap.
const MAX_UNZIPPED_BYTES = 4 * MAX_FILE_BYTES

export async function extractFileText(
  fileName: string,
  bytes: Uint8Array,
): Promise<string> {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'txt' || extension === 'md') {
    return new TextDecoder().decode(bytes)
  }
  if (extension === 'pdf') {
    try {
      const { text } = await extractText(await getDocumentProxy(bytes), {
        mergePages: true,
      })
      if (text.trim() !== '') return text
    } catch {
      // Fall through to the readable error below.
    }
    throw new Error(
      `Could not read any text from ${fileName}. If it is a scanned or image-based PDF, re-export it as a text-based PDF (e.g. open it in Google Docs and download as PDF), then retry.`,
    )
  }
  if (extension === 'docx' || extension === 'pptx') {
    const entries = unzipSync(bytes)
    const unzippedBytes = Object.values(entries).reduce(
      (sum, entry) => sum + entry.length,
      0,
    )
    if (unzippedBytes > MAX_UNZIPPED_BYTES) {
      throw new Error(`${fileName} decompresses far beyond its file size.`)
    }
    const keys =
      extension === 'docx'
        ? ['word/document.xml']
        : Object.keys(entries)
            .filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key))
            .sort(
              (a, b) =>
                Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')),
            )
    return keys
      .filter((key) => entries[key])
      .map((key) => extractXmlText(strFromU8(entries[key])))
      .join('\n')
  }
  throw new Error(`Unsupported file type: ${fileName}`)
}
