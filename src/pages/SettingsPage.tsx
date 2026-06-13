import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useProfile } from '../hooks/profileContext'
import { dimensionLabel } from '../lib/dimensions'
import {
  listCosmetics,
  listOwnedCosmeticIds,
  equipCosmetic,
} from '../services/cosmeticsService'
import {
  setPetCheersEnabled,
  setPetEnabled,
} from '../services/profileService'

function SettingsPage() {
  const { profile, setProfile } = useProfile()
  const catalog = useAsync(() => listCosmetics(), [])
  const ownership = useAsync(() => listOwnedCosmeticIds(), [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(apply: () => Promise<void>, patch: Partial<typeof profile>) {
    setBusy(true)
    setError(null)
    try {
      await apply()
      if (profile) setProfile({ ...profile, ...patch })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const togglePet = (enabled: boolean) =>
    save(() => setPetEnabled(enabled), { pet_enabled: enabled })

  const toggleCheers = (enabled: boolean) =>
    save(() => setPetCheersEnabled(enabled), { pet_cheers_enabled: enabled })

  const changeTheme = (id: string | null) =>
    save(() => equipCosmetic('theme', id), { equipped_theme: id })

  // The themes the user can switch to: free ones (Classic) plus any they own.
  const owned = ownership.data ?? new Set<string>()
  const themes = (catalog.data ?? []).filter(
    (item) => item.kind === 'theme' && (item.price === 0 || owned.has(item.id)),
  )

  return (
    <section className="settings">
      <h1>Settings</h1>
      {error ? <p className="state state-error">{error}</p> : null}
      <div className="card">
        <label className="setting-row">
          <input
            type="checkbox"
            checked={profile?.pet_enabled ?? true}
            disabled={busy || !profile}
            onChange={(event) => togglePet(event.target.checked)}
          />
          <span>
            <strong>Study pet</strong>
            <br />
            Show your active pet walking around the app while you study.
          </span>
        </label>
        <label className="setting-row">
          <input
            type="checkbox"
            checked={profile?.pet_cheers_enabled ?? true}
            disabled={busy || !profile || !(profile?.pet_enabled ?? true)}
            onChange={(event) => toggleCheers(event.target.checked)}
          />
          <span>
            <strong>Encouragement</strong>
            <br />
            Let your pet cheer you on with the occasional message.
          </span>
        </label>
      </div>
      <div className="card">
        <label className="setting-row">
          <span>
            <strong>Map dimension</strong>
            <br />
            Switch the world your course map lives in (themes you own).
          </span>
          <select
            value={profile?.equipped_theme ?? ''}
            disabled={busy || !profile || catalog.loading}
            onChange={(event) => changeTheme(event.target.value || null)}
          >
            <option value="">Default</option>
            {themes.map((theme) => {
              const dim = dimensionLabel(theme.data.dimension)
              return (
                <option key={theme.id} value={theme.id}>
                  {theme.name}
                  {dim ? ` · ${dim} map` : ''}
                </option>
              )
            })}
          </select>
        </label>
        {catalog.error ? (
          <p className="state state-error">{catalog.error}</p>
        ) : null}
      </div>
      <p>
        Raise your pets on the <Link to="/pets">Pets</Link> page and buy more
        themes in the <Link to="/market">Market</Link>.
      </p>
    </section>
  )
}

export default SettingsPage
