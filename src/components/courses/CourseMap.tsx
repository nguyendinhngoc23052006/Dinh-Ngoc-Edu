import { Link } from 'react-router-dom'
import type { ChapterWithNodes } from '../../services/lessonService'

interface CourseMapProps {
  courseId: string
  chapters: ChapterWithNodes[]
  completedNodeIds: Set<string>
}

// The Duolingo-style path: chapters in order, each with its lesson nodes.
function CourseMap({ courseId, chapters, completedNodeIds }: CourseMapProps) {
  if (chapters.length === 0) {
    return (
      <p className="state state-empty">
        No chapters yet — the course is still being generated.
      </p>
    )
  }
  return (
    <ol className="course-map">
      {chapters.map((chapter) => (
        <li key={chapter.id} className="chapter">
          <h3>
            {chapter.position}. {chapter.title}
          </h3>
          {chapter.summary ? <p>{chapter.summary}</p> : null}
          {chapter.nodes.length === 0 ? (
            <p className="state state-empty">No lessons in this chapter.</p>
          ) : (
            <ol className="node-path">
              {chapter.nodes.map((node) => (
                <li key={node.id}>
                  <Link
                    className={
                      completedNodeIds.has(node.id) ? 'node node-done' : 'node'
                    }
                    to={`/courses/${courseId}/nodes/${node.id}`}
                  >
                    {node.title}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </li>
      ))}
    </ol>
  )
}

export default CourseMap
