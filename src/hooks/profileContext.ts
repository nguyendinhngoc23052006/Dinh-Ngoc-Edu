import { createContext, useContext } from 'react'
import type { Profile } from '../types/database'

export interface ProfileContextValue {
  profile: Profile | null
  refresh: () => void
  setProfile: (profile: Profile | null) => void
}

export const ProfileContext = createContext<ProfileContextValue | null>(null)

// The signed-in user's profile (credits, equipped cosmetics, pet preference),
// shared app-wide. `refresh` re-reads it after credits change; `setProfile`
// applies a known-new value without a round trip.
export function useProfile(): ProfileContextValue {
  const context = useContext(ProfileContext)
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider')
  }
  return context
}
