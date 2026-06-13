import { useEffect } from 'react'
import { useAsync } from '../../hooks/useAsync'
import { useProfile } from '../../hooks/profileContext'
import { listCosmetics } from '../../services/cosmeticsService'

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

// Applies the equipped theme to the whole app (so the homepage and every course
// recolor) and renders the equipped pet walking along the bottom while the user
// studies. One catalog fetch backs both. Renders nothing visible but the pet.
function CosmeticsLayer() {
  const { profile } = useProfile()
  const catalog = useAsync(() => listCosmetics(), [])
  const cosmetics = catalog.data ?? []

  const theme = cosmetics.find(
    (item) => item.kind === 'theme' && item.id === profile?.equipped_theme,
  )
  const themeData = theme?.data

  useEffect(() => {
    const root = document.documentElement
    for (const name of THEME_VARS) root.style.removeProperty(name)
    if (themeData) {
      for (const [name, value] of Object.entries(themeData)) {
        root.style.setProperty(name, value)
      }
    }
  }, [themeData])

  const pet = cosmetics.find(
    (item) => item.kind === 'pet' && item.id === profile?.equipped_pet,
  )
  const sprite = profile?.pet_enabled ? pet?.data.sprite : undefined
  if (!sprite) return null

  return (
    <div className="pet-companion" aria-hidden="true">
      <span className="pet-sprite">{sprite}</span>
    </div>
  )
}

export default CosmeticsLayer
