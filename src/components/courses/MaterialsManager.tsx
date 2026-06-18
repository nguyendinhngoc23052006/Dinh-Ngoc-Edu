import { useRef, useState } from 'react'
import {
  deleteMaterial,
  uploadMaterial,
} from '../../services/materialService'
import type { CourseMaterial } from '../../types/database'

interface MaterialsManagerProps {
  courseId: string
  materials: CourseMaterial[]
  // Called after a successful add/remove so the parent reloads the course.
  onChanged: () => void
}

// Owner-only: manage a course's source files after creation. Adding a file runs
// the same upload + text-extraction path as course creation; removing one
// deletes the bytes and the row. Changes only take effect on the course the
// next time it is regenerated.
function MaterialsManager({
  courseId,
  materials,
  onChanged,
}: MaterialsManagerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : fallback)
    } finally {
      setBusy(false)
    }
  }

  function handleAdd(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    if (!file) return
    void run(async () => {
      await uploadMaterial(courseId, file)
    }, `Could not add ${file.name}.`)
  }

  function handleRemove(material: CourseMaterial) {
    void run(
      () => deleteMaterial(material),
      `Could not remove ${material.file_name}.`,
    )
  }

  return (
    <section className="card">
      <h2>Source materials</h2>
      {materials.length === 0 ? (
        <p className="state state-empty">
          No materials on this course. Add a file, then regenerate.
        </p>
      ) : (
        <ul className="material-list">
          {materials.map((material) => (
            <li key={material.id}>
              {material.file_name}{' '}
              <span className="course-meta">{material.extract_status}</span>{' '}
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => handleRemove(material)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="setting-row">
        <span>Add a material (PDF, TXT, MD, DOCX, PPTX — 10 MB max)</span>
        <input
          ref={inputRef}
          type="file"
          disabled={busy}
          accept=".pdf,.txt,.md,.docx,.pptx"
          onChange={handleAdd}
        />
      </label>
      {busy ? (
        <p className="state state-loading">Working — extracting text…</p>
      ) : null}
      {error ? <p className="state state-error">{error}</p> : null}
    </section>
  )
}

export default MaterialsManager
