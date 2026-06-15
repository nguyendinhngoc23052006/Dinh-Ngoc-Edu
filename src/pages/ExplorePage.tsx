import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAsync } from '../hooks/useAsync'
import {
  listOutputLanguages,
  listPublicCourses,
  PAGE_SIZE,
} from '../services/courseService'
import type { PublicCourseSort } from '../services/courseService'
import { getDisplayNames } from '../services/profileService'
import {
  listSavedCourseIds,
  saveCourse,
  unsaveCourse,
} from '../services/savedCourseService'
import CourseCard from '../components/courses/CourseCard'

function ExplorePage() {
  const [page, setPage] = useState(0)
  // `searchInput` is what's typed; `search` is what's applied (on submit), so we
  // don't refetch on every keystroke.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [language, setLanguage] = useState('')
  const [sort, setSort] = useState<PublicCourseSort>('recent')
  const [error, setError] = useState<string | null>(null)
  // Optimistic save/unsave overrides layered on the loaded saved-id set.
  const [localSaves, setLocalSaves] = useState<Record<string, boolean>>({})
  // Course ids with a save/unsave request in flight, to block double-clicks.
  const [inFlight, setInFlight] = useState<Set<string>>(() => new Set())

  const state = useAsync(
    () => listPublicCourses(page, { search, language, sort }),
    [page, search, language, sort],
  )
  const courses = state.data ?? []

  // One query for the whole page's authors (no per-card lookup); a failure here
  // just means cards render without a "by …" line.
  const ownerKey = courses.map((course) => course.owner_id).join(',')
  const authors = useAsync(
    () => getDisplayNames(courses.map((course) => course.owner_id)),
    [ownerKey],
  )
  const authorNames = authors.data ?? new Map<string, string>()

  // Load once so the Save/Saved state survives a page reload (Explore is behind
  // RequireAuth, so a session always exists here).
  const saved = useAsync(() => listSavedCourseIds(), [])
  const isSaved = (id: string): boolean =>
    localSaves[id] ?? saved.data?.has(id) ?? false

  function applySearch(event: FormEvent) {
    event.preventDefault()
    setPage(0)
    setSearch(searchInput)
  }

  async function toggleSave(courseId: string) {
    if (inFlight.has(courseId)) return
    const currently = isSaved(courseId)
    setError(null)
    setInFlight((current) => new Set(current).add(courseId))
    setLocalSaves((current) => ({ ...current, [courseId]: !currently }))
    try {
      if (currently) await unsaveCourse(courseId)
      else await saveCourse(courseId)
    } catch (cause) {
      // Roll the optimistic toggle back on failure.
      setLocalSaves((current) => ({ ...current, [courseId]: currently }))
      setError(cause instanceof Error ? cause.message : 'Save failed.')
    } finally {
      setInFlight((current) => {
        const next = new Set(current)
        next.delete(courseId)
        return next
      })
    }
  }

  return (
    <section>
      <h1>Explore public courses</h1>
      <form className="explore-filters" onSubmit={applySearch}>
        <input
          type="search"
          value={searchInput}
          placeholder="Search by title"
          aria-label="Search by title"
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <button type="submit">Search</button>
        <select
          value={language}
          aria-label="Filter by language"
          onChange={(event) => {
            setPage(0)
            setLanguage(event.target.value)
          }}
        >
          <option value="">All languages</option>
          {listOutputLanguages().map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={sort}
          aria-label="Sort"
          onChange={(event) => {
            setPage(0)
            setSort(event.target.value as PublicCourseSort)
          }}
        >
          <option value="recent">Newest first</option>
          <option value="title">Title A–Z</option>
        </select>
      </form>
      {error ? <p className="state state-error">{error}</p> : null}
      {state.loading ? (
        <p className="state state-loading">Loading public courses…</p>
      ) : state.error ? (
        <p className="state state-error">
          {state.error}{' '}
          <button type="button" onClick={state.reload}>
            Retry
          </button>
        </p>
      ) : courses.length === 0 ? (
        <p className="state state-empty">
          {page === 0
            ? 'No public courses match — try a different search or filter.'
            : 'No more courses.'}
        </p>
      ) : (
        <div className="card-grid">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              authorName={authorNames.get(course.owner_id)}
              action={
                <button
                  type="button"
                  disabled={inFlight.has(course.id)}
                  onClick={() => toggleSave(course.id)}
                >
                  {isSaved(course.id) ? 'Saved ✓' : 'Save'}
                </button>
              }
            />
          ))}
        </div>
      )}
      <div className="pager">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={courses.length < PAGE_SIZE}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </section>
  )
}

export default ExplorePage
