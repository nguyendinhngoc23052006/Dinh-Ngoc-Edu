import type { Chapter } from '../../types/database'

interface ChapterPickerProps {
  chapters: Chapter[]
  selectedIds: string[]
  onToggle: (chapterId: string) => void
}

// Lets the user choose which chapters feed the mock test.
function ChapterPicker({
  chapters,
  selectedIds,
  onToggle,
}: ChapterPickerProps) {
  if (chapters.length === 0) {
    return (
      <p className="state state-empty">
        This course has no chapters to test on yet.
      </p>
    )
  }
  return (
    <ul className="chapter-picker">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <label>
            <input
              type="checkbox"
              checked={selectedIds.includes(chapter.id)}
              onChange={() => onToggle(chapter.id)}
            />
            {chapter.position}. {chapter.title}
          </label>
        </li>
      ))}
    </ul>
  )
}

export default ChapterPicker
