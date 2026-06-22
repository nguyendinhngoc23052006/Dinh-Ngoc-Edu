import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getMyProfile } from '../services/profileService'
import type { Profile } from '../types/database'
import { ProfileContext } from './profileContext'
import { useAuth } from './useAuth'

// Loads the signed-in user's profile once and shares it through context.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [version, setVersion] = useState(0)
  const userId = session?.user.id ?? null

  // biome-ignore lint/correctness/useExhaustiveDependencies: getMyProfile/setProfile are stable references; only userId+version should trigger a re-fetch
  useEffect(() => {
    let active = true
    if (!userId) {
      setProfile(null)
      return
    }
    getMyProfile()
      .then((next) => {
        if (active) setProfile(next)
      })
      .catch(() => {
        if (active) setProfile(null)
      })
    return () => {
      active = false
    }
  }, [userId, version])

  return (
    <ProfileContext.Provider
      value={{ profile, refresh: () => setVersion((v) => v + 1), setProfile }}
    >
      {children}
    </ProfileContext.Provider>
  )
}
