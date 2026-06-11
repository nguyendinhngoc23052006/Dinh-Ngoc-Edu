import type { Visibility } from '../../types/database'

interface VisibilityToggleProps {
  visibility: Visibility
  busy: boolean
  onChange: (next: Visibility) => void
}

// Owner-only control to share a course publicly or make it private again.
function VisibilityToggle({
  visibility,
  busy,
  onChange,
}: VisibilityToggleProps) {
  const next: Visibility = visibility === 'private' ? 'public' : 'private'
  return (
    <div className="visibility-toggle">
      <span>
        This course is <strong>{visibility}</strong>
        {visibility === 'public'
          ? ' — anyone on Explore can view and save it.'
          : ' — only you can see it.'}
      </span>
      <button type="button" disabled={busy} onClick={() => onChange(next)}>
        Make {next}
      </button>
    </div>
  )
}

export default VisibilityToggle
