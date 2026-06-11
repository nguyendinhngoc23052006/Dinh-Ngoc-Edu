import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'

// Gate for logged-in routes: shows nothing while the session loads, bounces
// anonymous visitors to /login, otherwise renders the nested route.
function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="state state-loading">Checking session…</p>
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <Outlet />
}

export default RequireAuth
