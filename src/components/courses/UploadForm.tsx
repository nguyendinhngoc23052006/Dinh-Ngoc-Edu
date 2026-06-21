import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  listOutputLanguages,
  validateNewCourse,
} from '../../services/courseService'
import { validateMaterialFile } from '../../services/materialService'

export interface UploadInput {
  title: string
  outputLanguage: string
  files: File[]
}

interface UploadFormProps {
  onSubmit: (input: UploadInput) => Promise<void>
  // Prefill (e.g. a guest's stashed form after login); files included, since
  // they only exist in memory and can't be re-set on the file input.
  initial?: UploadInput
}

// Materials are uploaded once per course, at creation time.
function UploadForm({ onSubmit, initial }: UploadFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [outputLanguage, setOutputLanguage] = useState(
    initial?.outputLanguage ?? 'English',
  )
  const [files, setFiles] = useState<File[]>(initial?.files ?? [])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem =
      validateNewCourse(title, outputLanguage) ??
      (files.length === 0
        ? 'Upload at least one material file.'
        : files.length > 10
          ? 'Upload at most 10 files per course.'
          : (files.map(validateMaterialFile).find((p) => p !== null) ?? null))
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    setBusy(true)
    try {
      await onSubmit({ title, outputLanguage, files })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card form" onSubmit={handleSubmit}>
      <label>
        Course title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Microeconomics midterm"
        />
      </label>
      <label>
        Output language
        <select
          value={outputLanguage}
          onChange={(e) => setOutputLanguage(e.target.value)}
        >
          {listOutputLanguages().map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </select>
      </label>
      <label>
        Materials (uploaded once per course)
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <p className="course-meta">
        Supported: PDF (text-based), DOCX, PPTX, TXT, MD — up to 10 MB each.
        Scanned PDFs (photos of book pages) and handwritten notes are not
        supported — open in Google Docs and export as PDF first.
      </p>
      {files.length > 0 ? (
        <p className="course-meta">
          Ready to upload: {files.map((file) => file.name).join(', ')}
        </p>
      ) : null}
      {error ? <p className="state state-error">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating course…' : 'Generate course'}
      </button>
    </form>
  )
}

export default UploadForm
