import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  listOutputLanguages,
  validateNewCourse,
} from '../../services/courseService'
import { validateMaterialFile } from '../../services/materialService'

interface UploadFormProps {
  onSubmit: (input: {
    title: string
    outputLanguage: string
    files: File[]
  }) => Promise<void>
}

// Materials are uploaded once per course, at creation time.
function UploadForm({ onSubmit }: UploadFormProps) {
  const [title, setTitle] = useState('')
  const [outputLanguage, setOutputLanguage] = useState('English')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const problem =
      validateNewCourse(title, outputLanguage) ??
      (files.length === 0
        ? 'Upload at least one material file.'
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
      {error ? <p className="state state-error">{error}</p> : null}
      <button type="submit" disabled={busy}>
        {busy ? 'Creating course…' : 'Generate course'}
      </button>
    </form>
  )
}

export default UploadForm
