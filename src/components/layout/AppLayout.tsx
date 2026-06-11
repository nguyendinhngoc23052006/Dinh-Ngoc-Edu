import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { signOut } from '../../services/authService'

function AppLayout() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          Last Minute
        </Link>
        <nav className="app-nav">
          <NavLink to="/explore">Explore</NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
          {loading ? null : session ? (
            <button type="button" onClick={handleSignOut}>
              Log out
            </button>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
