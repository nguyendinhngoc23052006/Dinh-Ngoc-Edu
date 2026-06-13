import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAsync } from '../hooks/useAsync'
import { useProfile } from '../hooks/profileContext'
import { eggReady, petForm, petProgress } from '../lib/petProgress'
import { listFood, listMyFood } from '../services/foodService'
import {
  adoptPet,
  feedPet,
  hatchPet,
  listMyPets,
  listSpecies,
  releasePet,
  setActivePet,
} from '../services/petService'
import type { Pet, Species } from '../types/database'

const MAX_PETS = 3

function spriteFor(pet: Pet, species: Species | undefined): string {
  if (pet.stage === 'egg' || !species) return '🥚'
  const form = petForm(pet.xp)
  if (form === 3) return species.form3_sprite
  if (form === 2) return species.form2_sprite
  return species.form1_sprite
}

function label(pet: Pet, species: Species | undefined): string {
  if (pet.stage === 'egg') return 'Mystery Egg'
  if (!species) return 'Pet'
  return `${species.name} · Form ${petForm(pet.xp)}`
}

function PetsPage() {
  const { refresh } = useProfile()
  const pets = useAsync(() => listMyPets(), [])
  const species = useAsync(() => listSpecies(), [])
  const foodCatalog = useAsync(() => listFood(), [])
  const inventory = useAsync(() => listMyFood(), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const myPets = pets.data ?? []
  const speciesById = new Map((species.data ?? []).map((s) => [s.id, s]))
  const foods = foodCatalog.data ?? []
  const stock = inventory.data ?? new Map<string, number>()
  const ownedFoods = foods.filter((f) => (stock.get(f.id) ?? 0) > 0)
  // The page renders once pets load; surface the secondary loads' failures too,
  // or a failed species/food fetch would silently show wrong sprites and no food.
  const loadError = species.error ?? foodCatalog.error ?? inventory.error

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const adopt = () =>
    run('adopt', async () => {
      await adoptPet()
      pets.reload()
    })

  const hatch = (pet: Pet) =>
    run(pet.id, async () => {
      await hatchPet(pet.id)
      pets.reload()
      refresh()
    })

  const activate = (pet: Pet) =>
    run(pet.id, async () => {
      await setActivePet(pet.id)
      pets.reload()
    })

  const feed = (pet: Pet, foodId: string) =>
    run(`${pet.id}:${foodId}`, async () => {
      await feedPet(pet.id, foodId, 1)
      pets.reload()
      inventory.reload()
    })

  const release = (pet: Pet) => {
    if (!window.confirm('Release this pet for good? This cannot be undone.')) {
      return
    }
    return run(pet.id, async () => {
      await releasePet(pet.id)
      pets.reload()
    })
  }

  if (pets.loading) {
    return <p className="state state-loading">Loading your pets…</p>
  }
  if (pets.error) {
    return (
      <p className="state state-error">
        {pets.error}{' '}
        <button type="button" onClick={pets.reload}>
          Retry
        </button>
      </p>
    )
  }

  return (
    <section className="pets">
      <header className="pets-header">
        <h1>Your Pets</h1>
        <span className="credit-badge">
          {myPets.length} / {MAX_PETS}
        </span>
        <button
          type="button"
          disabled={busy === 'adopt' || myPets.length >= MAX_PETS}
          onClick={adopt}
        >
          {busy === 'adopt'
            ? 'Adopting…'
            : myPets.length >= MAX_PETS
              ? 'Storage full'
              : 'Adopt an egg'}
        </button>
      </header>
      <p className="market-blurb">
        Feed pets to hatch and evolve them. Buy food in the{' '}
        <Link to="/market">Market</Link>. Only the active pet walks on screen.
      </p>
      {error ? <p className="state state-error">{error}</p> : null}
      {loadError ? (
        <p className="state state-error">
          Some pet data failed to load ({loadError}).{' '}
          <button
            type="button"
            onClick={() => {
              species.reload()
              foodCatalog.reload()
              inventory.reload()
            }}
          >
            Retry
          </button>
        </p>
      ) : null}

      {myPets.length === 0 ? (
        <p className="state state-empty">
          You have no pets. Adopt an egg to begin.
        </p>
      ) : (
        <div className="market-grid">
          {myPets.map((pet) => {
            const sp = pet.species_id
              ? speciesById.get(pet.species_id)
              : undefined
            const prog = petProgress(pet.stage, pet.xp)
            const ready = pet.stage === 'egg' && eggReady(pet.xp)
            return (
              <div key={pet.id} className="card market-card">
                <div className="pet-preview">{spriteFor(pet, sp)}</div>
                <h3>{label(pet, sp)}</h3>
                {sp ? (
                  <span className={`pet-rarity rarity-${sp.rarity}`}>
                    {sp.rarity}
                  </span>
                ) : (
                  <span className="pet-rarity">unhatched</span>
                )}
                {pet.is_active ? (
                  <span className="pet-active">★ Active</span>
                ) : null}

                {prog.atMax ? (
                  <p className="market-desc">Fully evolved</p>
                ) : (
                  <>
                    <progress
                      className="pet-xp"
                      value={Math.min(prog.have, prog.need)}
                      max={prog.need}
                    />
                    <p className="market-desc">
                      {Math.min(prog.have, prog.need)} / {prog.need} xp{' '}
                      {prog.toward === 'hatch' ? 'to hatch' : 'to evolve'}
                    </p>
                  </>
                )}

                {ready ? (
                  <button
                    type="button"
                    disabled={busy === pet.id}
                    onClick={() => hatch(pet)}
                  >
                    {busy === pet.id ? 'Hatching…' : 'Hatch!'}
                  </button>
                ) : null}

                <div className="pet-feed">
                  {ownedFoods.length === 0 ? (
                    <p className="market-desc">No food — buy some in the Market.</p>
                  ) : (
                    ownedFoods.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        className="ghost"
                        disabled={busy === `${pet.id}:${f.id}`}
                        onClick={() => feed(pet, f.id)}
                        title={`Feed ${f.name} (+${f.xp_value} xp)`}
                      >
                        {f.sprite} +{f.xp_value} ({stock.get(f.id) ?? 0})
                      </button>
                    ))
                  )}
                </div>

                <div className="pet-actions">
                  {!pet.is_active ? (
                    <button
                      type="button"
                      className="ghost"
                      disabled={busy === pet.id}
                      onClick={() => activate(pet)}
                    >
                      Set active
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="danger"
                    disabled={busy === pet.id}
                    onClick={() => release(pet)}
                  >
                    Release
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default PetsPage
