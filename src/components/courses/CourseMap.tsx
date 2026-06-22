import { Link } from 'react-router-dom'
import type { ChapterWithNodes } from '../../services/lessonService'

interface CourseMapProps {
  courseId: string
  chapters: ChapterWithNodes[]
  completedNodeIds: Set<string>
}

// The Duolingo-style path: chapter banners, then each lesson as a circular
// node on a winding vertical trail. Done nodes get a check; the first
// not-yet-done node is highlighted as the place to continue.
function CourseMap({ courseId, chapters, completedNodeIds }: CourseMapProps) {
  if (chapters.length === 0) {
    return (
      <p className="state state-empty">
        No chapters yet — the course is still being generated.
      </p>
    )
  }
  const nextNodeId = chapters
    .flatMap((chapter) => chapter.nodes)
    .find((node) => !completedNodeIds.has(node.id))?.id

  return (
    <div className="course-map">
      {chapters.map((chapter) => (
        <section key={chapter.id} className="chapter">
          <header className="chapter-banner">
            <h3>
              Chapter {chapter.position} · {chapter.title}
            </h3>
            {chapter.summary ? <p>{chapter.summary}</p> : null}
          </header>
          {chapter.nodes.length === 0 ? (
            <p className="state state-empty">No lessons in this chapter.</p>
          ) : (
            <ol className="node-path">
              {chapter.nodes.map((node, index) => {
                const done = completedNodeIds.has(node.id)
                const next = node.id === nextNodeId
                return (
                  <li
                    key={node.id}
                    className={`node-step node-step-${index % 4}`}
                  >
                    <Link
                      className={
                        done
                          ? 'node node-done'
                          : next
                            ? 'node node-next'
                            : 'node'
                      }
                      to={`/courses/${courseId}/nodes/${node.id}`}
                    >
                      <span className="node-circle" aria-hidden="true">
                        {done ? '✓' : '★'}
                      </span>
                      {next ? <span className="node-start">START</span> : null}
                      <span className="node-label">{node.title}</span>
                      {node.credit_prize > 0 && !done ? (
                        <span
                          className="node-prize"
                          title="Credits for a flawless run"
                        >
                          ⭐ {node.credit_prize}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}

export default CourseMap
