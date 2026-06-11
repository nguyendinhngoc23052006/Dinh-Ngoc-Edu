import { useLocation, useNavigate } from 'react-router-dom'
import LoginForm from '../components/auth/LoginForm'

function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from =
    (location.state as { from?: string } | null)?.from ?? '/dashboard'

  return (
    <section>
      <LoginForm onSuccess={() => navigate(from, { replace: true })} />
    </section>
  )
}

export default LoginPage
