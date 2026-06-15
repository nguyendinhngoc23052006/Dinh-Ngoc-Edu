import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useProfile } from '../../hooks/profileContext'
import { signOut } from '../../services/authService'
import CosmeticsLayer from './CosmeticsLayer'

function AppLayout() {
  const { session, loading } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  // Keying the page wrapper on the path replays the route-in animation on each
  // navigation, so moving between pages reads as movement through one space.
  const location = useLocation()

  async function handleSignOut() {
    try {
      await signOut()
    } catch {
      // The local session is cleared even when the server call fails.
    }
    navigate('/')
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚡
          </span>
          Last Minute
        </Link>
        <nav className="app-nav">
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          {loading ? null : session ? (
            <>
              <NavLink to="/market">Market</NavLink>
              <NavLink to="/pets">Pets</NavLink>
              <NavLink to="/settings">Settings</NavLink>
              {profile ? (
                <Link to="/market" className="credit-badge" title="Your credits">
                  ⭐ {profile.credits}
                </Link>
              ) : null}
              <button type="button" onClick={handleSignOut}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </header>
      <main className="app-main">
        <div className="route-view" key={location.pathname}>
          <Outlet />
        </div>
      </main>
      <CosmeticsLayer />
    </div>
  )
}

export default AppLayout
