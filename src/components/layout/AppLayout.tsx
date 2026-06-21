import { useEffect, useRef } from 'react'
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
  const location = useLocation()
  const headerRef = useRef<HTMLElement>(null)
  const lastY = useRef(0)

  // On mobile: hide the header while scrolling down, reveal it on scroll-up.
  // The CSS transition handles the smooth fade+slide; JS only toggles the class.
  useEffect(() => {
    const THRESHOLD = 8 // px — ignore tiny jitter
    function onScroll() {
      const y = window.scrollY
      const delta = y - lastY.current
      if (Math.abs(delta) < THRESHOLD) return
      headerRef.current?.classList.toggle('header-hidden', delta > 0 && y > 60)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
      <header ref={headerRef} className="app-header">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ⚡
          </span>
          Dinh Ngoc Edu
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
