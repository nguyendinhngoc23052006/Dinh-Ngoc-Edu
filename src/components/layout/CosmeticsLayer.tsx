import { useEffect, useState } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { useProfile } from '../../hooks/profileContext'
import { usePetWander } from '../../hooks/usePetWander'
import { petForm } from '../../lib/petProgress'
import { pickCheer } from '../../lib/petCheers'
import { listCosmetics } from '../../services/cosmeticsService'
import { getActivePet, listSpecies } from '../../services/petService'
import PetSprite from '../pet/PetSprite'
import type { Pet, Species } from '../../types/database'

// On-screen size (px) of the roaming companion before per-form scaling.
const PET_SIZE = 30

// Every CSS variable a theme may override; cleared before applying a theme so
// switching away from one that set extras (e.g. Midnight's --muted/--line)
// falls back to the :root defaults.
const THEME_VARS = [
  '--green',
  '--green-dark',
  '--green-soft',
  '--bg',
  '--ink',
  '--muted',
  '--line',
]

const CHEER_EVERY_MS = 25000
const CHEER_SHOW_MS = 6000

// The emoji fallback for a pet: an egg, or its species' form glyph — shown when
// the species sprite image is missing. The drawn sprite is PetSprite's job.
function emojiFor(pet: Pet, species: Species | undefined): string {
  if (pet.stage === 'egg' || !species) return '🥚'
  const form = petForm(pet.xp)
  if (form === 3) return species.form3_sprite
  if (form === 2) return species.form2_sprite
  return species.form1_sprite
}

// Applies the equipped theme to the whole app (so the homepage and every course
// recolor) and renders the user's ACTIVE pet (from the pets table) walking along
// the bottom, occasionally throwing out an encouragement. Renders nothing
// visible but the pet.
function CosmeticsLayer() {
  const { profile } = useProfile()
  const catalog = useAsync(() => listCosmetics(), [])
  // Refetch the companion when the user changes or hatches one (pets_hatched
  // bumps on hatch and triggers a profile refresh).
  const activePet = useAsync(
    () => getActivePet(),
    [profile?.user_id, profile?.pets_hatched],
  )
  const species = useAsync(() => listSpecies(), [])
  const cosmetics = catalog.data ?? []

  const theme = cosmetics.find(
    (item) => item.kind === 'theme' && item.id === profile?.equipped_theme,
  )
  const themeData = theme?.data

  useEffect(() => {
    const root = document.documentElement
    for (const name of THEME_VARS) root.style.removeProperty(name)
    // data carries CSS-variable colors plus a non-CSS `dimension` token; apply
    // only the `--` vars to :root and route the token to a data attribute that
    // the course-map CSS re-skins from.
    if (themeData) {
      for (const [name, value] of Object.entries(themeData)) {
        if (name.startsWith('--')) root.style.setProperty(name, value)
      }
    }
    if (themeData?.dimension) {
      root.setAttribute('data-dimension', themeData.dimension)
    } else {
      root.removeAttribute('data-dimension')
    }
  }, [themeData])

  const pet = activePet.data
  const sp = pet?.species_id
    ? (species.data ?? []).find((s) => s.id === pet.species_id)
    : undefined
  const shown = !!(pet && profile?.pet_enabled)
  const form = pet && pet.stage === 'hatched' ? petForm(pet.xp) : 1

  // Roam across the viewport (the hook parks the pet still under
  // prefers-reduced-motion). Called unconditionally to satisfy the hooks rules.
  const motion = usePetWander(shown, PET_SIZE)

  // Cheers only from a hatched companion (an egg stays silent), and only when
  // the user hasn't turned them off.
  const cheersOn =
    shown && pet?.stage === 'hatched' && (profile?.pet_cheers_enabled ?? true)
  const [cheer, setCheer] = useState<string | null>(null)

  useEffect(() => {
    if (!cheersOn) return
    let last: string | undefined
    let hideTimer = 0
    const interval = window.setInterval(() => {
      last = pickCheer(last)
      setCheer(last)
      hideTimer = window.setTimeout(() => setCheer(null), CHEER_SHOW_MS)
    }, CHEER_EVERY_MS)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(hideTimer)
    }
  }, [cheersOn])

  if (!shown || !pet) return null

  return (
    <div
      className="pet-companion"
      aria-hidden="true"
      style={{ transform: `translate(${motion.x}px, ${motion.y}px)` }}
    >
      {cheersOn && cheer ? <span className="pet-cheer">{cheer}</span> : null}
      <PetSprite
        speciesId={pet.species_id}
        form={form}
        emoji={emojiFor(pet, sp)}
        size={PET_SIZE}
        facing={motion.facing}
      />
    </div>
  )
}

export default CosmeticsLayer
