import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useProfile } from '../hooks/profileContext'
import { useAsync } from '../hooks/useAsync'
import { useIdempotencyKeys } from '../hooks/useIdempotencyKeys'
import { dimensionLabel } from '../lib/dimensions'
import {
  equipCosmetic,
  listCosmetics,
  listOwnedCosmeticIds,
  purchaseCosmetic,
} from '../services/cosmeticsService'
import { buyFood, listFood, listMyFood } from '../services/foodService'
import type { Cosmetic, Food } from '../types/database'

function MarketPage() {
  const { profile, refresh } = useProfile()
  const catalog = useAsync(() => listCosmetics(), [])
  const ownership = useAsync(() => listOwnedCosmeticIds(), [])
  const foodCatalog = useAsync(() => listFood(), [])
  const inventory = useAsync(() => listMyFood(), [])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Stable idempotency keys for the purchases below, so a retry after a lost
  // response can't double-charge.
  const { keyFor, clearKey } = useIdempotencyKeys()

  const credits = profile?.credits ?? 0
  const cosmetics = catalog.data ?? []
  const owned = ownership.data ?? new Set<string>()
  const foods = foodCatalog.data ?? []
  const stock = inventory.data ?? new Map<string, number>()

  // Price 0 items are usable without buying; everything else needs ownership.
  const isUnlocked = (item: Cosmetic) => item.price === 0 || owned.has(item.id)

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
    const id = `cosmetic:${item.id}`
    return run(item.id, async () => {
      await purchaseCosmetic(item.id, keyFor(id))
      clearKey(id)
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

  function buyOne(item: Food) {
    const id = `food:${item.id}`
    return run(item.id, async () => {
      await buyFood(item.id, 1, keyFor(id))
      clearKey(id)
      inventory.reload()
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

  const themes = (
    <section className="market-section">
      <h2>Themes</h2>
      <p className="market-blurb">
        Recolor the whole app and turn your course map into a themed world.
      </p>
      <div className="market-grid">
        {cosmetics
          .filter((item) => item.kind === 'theme')
          .map((item) => {
            const unlocked = isUnlocked(item)
            const equipped = profile?.equipped_theme === item.id
            const busy = busyId === item.id
            return (
              <div key={item.id} className="card market-card">
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
                <h3>{item.name}</h3>
                <p className="market-desc">{item.description}</p>
                {dimensionLabel(item.data.dimension) ? (
                  <p className="market-dimension">
                    🗺️ {dimensionLabel(item.data.dimension)} map
                  </p>
                ) : null}
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
        Earn credits by finishing lessons with no mistakes, then spend them
        here. <Link to="/settings">Settings</Link> lets you turn the pet off.
      </p>
      {error ? <p className="state state-error">{error}</p> : null}
      {themes}
      <section className="market-section">
        <h2>Food</h2>
        <p className="market-blurb">
          Buy food, then feed it to your pets on the{' '}
          <Link to="/pets">Pets</Link> page to hatch and grow them.
        </p>
        {foodCatalog.loading ? (
          <p className="state state-loading">Loading food…</p>
        ) : foodCatalog.error ? (
          <p className="state state-error">{foodCatalog.error}</p>
        ) : (
          <div className="market-grid">
            {foods.map((item) => {
              const have = stock.get(item.id) ?? 0
              const busy = busyId === item.id
              return (
                <div key={item.id} className="card market-card">
                  <div className="pet-preview">{item.sprite}</div>
                  <h3>{item.name}</h3>
                  <p className="market-desc">{item.description}</p>
                  <p className="market-price">
                    ⭐ {item.price} · +{item.xp_value} xp
                  </p>
                  <p className="food-owned">Owned: {have}</p>
                  <button
                    type="button"
                    disabled={busy || credits < item.price}
                    onClick={() => buyOne(item)}
                  >
                    {busy
                      ? 'Working…'
                      : credits < item.price
                        ? 'Not enough credits'
                        : 'Buy'}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </section>
  )
}

export default MarketPage
