import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useProfile } from '../hooks/profileContext'
import {
  equipCosmetic,
  listCosmetics,
  listOwnedCosmeticIds,
  purchaseCosmetic,
} from '../services/cosmeticsService'
import type { Cosmetic } from '../types/database'

function MarketPage() {
  const { profile, refresh } = useProfile()
  const catalog = useAsync(() => listCosmetics(), [])
  const ownership = useAsync(() => listOwnedCosmeticIds(), [])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const credits = profile?.credits ?? 0
  const cosmetics = catalog.data ?? []
  const owned = ownership.data ?? new Set<string>()

  // Price 0 items are usable without buying; everything else needs ownership.
  const isUnlocked = (item: Cosmetic) => item.price === 0 || owned.has(item.id)
  const equippedId = (item: Cosmetic) =>
    item.kind === 'theme' ? profile?.equipped_theme : profile?.equipped_pet

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusyId(null)
    }
  }

  function buy(item: Cosmetic) {
    return run(item.id, async () => {
      await purchaseCosmetic(item.id)
      ownership.reload()
      refresh()
    })
  }

  function equip(item: Cosmetic) {
    return run(item.id, async () => {
      await equipCosmetic(item.kind, item.id)
      refresh()
    })
  }

  function unequip(item: Cosmetic) {
    return run(item.id, async () => {
      await equipCosmetic(item.kind, null)
      refresh()
    })
  }

  if (catalog.loading) {
    return <p className="state state-loading">Loading the market…</p>
  }
  if (catalog.error) {
    return (
      <p className="state state-error">
        {catalog.error}{' '}
        <button type="button" onClick={catalog.reload}>
          Retry
        </button>
      </p>
    )
  }

  const section = (kind: 'theme' | 'pet', title: string, blurb: string) => (
    <section className="market-section">
      <h2>{title}</h2>
      <p className="market-blurb">{blurb}</p>
      <div className="market-grid">
        {cosmetics
          .filter((item) => item.kind === kind)
          .map((item) => {
            const unlocked = isUnlocked(item)
            const equipped = equippedId(item) === item.id
            const busy = busyId === item.id
            return (
              <div key={item.id} className="card market-card">
                {item.kind === 'theme' ? (
                  <div
                    className="theme-swatch"
                    style={{
                      background: item.data['--bg'],
                      borderColor: item.data['--green'],
                    }}
                  >
                    <span style={{ background: item.data['--green'] }} />
                    <span style={{ background: item.data['--green-soft'] }} />
                    <span style={{ background: item.data['--ink'] }} />
                  </div>
                ) : (
                  <div className="pet-preview">{item.data.sprite}</div>
                )}
                <h3>{item.name}</h3>
                <p className="market-desc">{item.description}</p>
                <p className="market-price">
                  {item.price === 0 ? 'Free' : `⭐ ${item.price}`}
                </p>
                {equipped ? (
                  <button
                    type="button"
                    className="ghost"
                    disabled={busy}
                    onClick={() => unequip(item)}
                  >
                    {busy ? 'Working…' : 'Unequip'}
                  </button>
                ) : unlocked ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => equip(item)}
                  >
                    {busy ? 'Working…' : 'Equip'}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || credits < item.price}
                    onClick={() => buy(item)}
                  >
                    {busy
                      ? 'Working…'
                      : credits < item.price
                        ? 'Not enough credits'
                        : 'Buy'}
                  </button>
                )}
              </div>
            )
          })}
      </div>
    </section>
  )

  return (
    <section className="market">
      <header className="market-header">
        <h1>Market</h1>
        <span className="credit-badge">⭐ {credits} credits</span>
      </header>
      <p>
        Earn credits by finishing lessons with no mistakes, then spend them here.{' '}
        <Link to="/settings">Settings</Link> lets you turn the pet off.
      </p>
      {error ? <p className="state state-error">{error}</p> : null}
      {section('theme', 'Themes', 'Recolor the whole app — homepage and courses.')}
      {section('pet', 'Pets', 'A companion that walks around while you study.')}
    </section>
  )
}

export default MarketPage
