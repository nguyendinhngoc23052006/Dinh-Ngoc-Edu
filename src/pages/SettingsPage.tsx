import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../hooks/profileContext'
import {
  setPetCheersEnabled,
  setPetEnabled,
} from '../services/profileService'

function SettingsPage() {
  const { profile, setProfile } = useProfile()
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
      <p>
        Raise your pets on the <Link to="/pets">Pets</Link> page and pick a theme
        in the <Link to="/market">Market</Link>.
      </p>
    </section>
  )
}

export default SettingsPage
