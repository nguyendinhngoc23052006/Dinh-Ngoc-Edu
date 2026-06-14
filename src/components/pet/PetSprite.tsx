import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PetForm } from '../../lib/petProgress'
import { petFormFilter, petFormScale, petSpriteUrl } from '../../lib/petSprite'
import type { Facing } from '../../lib/petWander'

interface PetSpriteProps {
  // The pet's species; null for an unhatched egg (emoji only).
  speciesId: string | null
  form: PetForm
  // Shown if there is no species (egg) or the sprite image fails to load.
  emoji: string
  // Base on-screen size in px (before per-form scaling).
  size?: number
  facing?: Facing
}

// Renders a pet as an animated walking spritesheet (4 frames of the front row,
// stepped in CSS), scaled and tinted by evolution form, flipped to face its
// travel direction. Falls back to the species emoji for an egg or a missing /
// broken sprite file — so the companion never disappears.
function PetSprite({
  speciesId,
  form,
  emoji,
  size = 28,
  facing = 'right',
}: PetSpriteProps) {
  // The species whose sprite image failed to load. Keying failure to the id
  // (rather than a boolean we'd have to reset) avoids a synchronous setState on
  // every species change.
  const [failedId, setFailedId] = useState<string | null>(null)

  useEffect(() => {
    if (!speciesId) return
    const img = new Image()
    img.onerror = () => setFailedId(speciesId)
    img.src = petSpriteUrl(speciesId)
  }, [speciesId])

  const scale = petFormScale(form)
  const px = Math.round(size * scale)

  if (!speciesId || failedId === speciesId) {
    return (
      <span
        className="pet-emoji"
        style={{ fontSize: `${px}px`, lineHeight: 1 }}
        role="img"
        aria-label="pet"
      >
        {emoji}
      </span>
    )
  }

  const frameStyle: CSSProperties = {
    width: `${px}px`,
    height: `${px}px`,
    backgroundImage: `url(${petSpriteUrl(speciesId)})`,
    filter: petFormFilter(form),
  }
  // The flip lives on the wrapper, NOT the frame: the frame runs the bob/step
  // keyframes (which animate `transform`), and a live animation overrides an
  // inline `transform` — so a flip on the frame itself would never show.
  return (
    <span
      className="pet-sprite"
      style={{ transform: facing === 'left' ? 'scaleX(-1)' : undefined }}
      aria-hidden="true"
    >
      <span className="pet-sprite-frame" style={frameStyle} />
    </span>
  )
}

export default PetSprite
