import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Profile } from '../types/database'
import { getMyProfile } from '../services/profileService'
import { useAuth } from './useAuth'
import { ProfileContext } from './profileContext'

// Loads the signed-in user's profile once and shares it through context.
export function ProfileProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [version, setVersion] = useState(0)
  const userId = session?.user.id ?? null

  /* eslint-disable react-hooks/set-state-in-effect --
     Clearing the profile on sign-out must happen synchronously; the loaded
     value lands later from the async fetch. */
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
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <ProfileContext.Provider
      value={{ profile, refresh: () => setVersion((v) => v + 1), setProfile }}
    >
      {children}
    </ProfileContext.Provider>
  )
}
