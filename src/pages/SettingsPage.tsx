import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../hooks/profileContext'
import { setPetEnabled } from '../services/profileService'

function SettingsPage() {
  const { profile, setProfile } = useProfile()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function togglePet(enabled: boolean) {
    setBusy(true)
    setError(null)
    try {
      await setPetEnabled(enabled)
      if (profile) setProfile({ ...profile, pet_enabled: enabled })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

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
            Show your equipped pet walking around the app while you study.
          </span>
        </label>
      </div>
      <p>
        Choose a theme or pet in the <Link to="/market">Market</Link>.
      </p>
    </section>
  )
}

export default SettingsPage
