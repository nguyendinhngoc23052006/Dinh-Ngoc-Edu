import { BrowserRouter, Route, Routes } from 'react-router-dom'
import RequireAuth from './components/auth/RequireAuth'
import AppLayout from './components/layout/AppLayout'
import { ProfileProvider } from './hooks/ProfileProvider'
import CoursePage from './pages/CoursePage'
import DashboardPage from './pages/DashboardPage'
import ExplorePage from './pages/ExplorePage'
import LandingPage from './pages/LandingPage'
import LessonPage from './pages/LessonPage'
import LoginPage from './pages/LoginPage'
import MarketPage from './pages/MarketPage'
import MockTestPage from './pages/MockTestPage'
import NewCoursePage from './pages/NewCoursePage'
import NewMockTestPage from './pages/NewMockTestPage'
import PetsPage from './pages/PetsPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            {/* Reached logged-out via the reset email; the link sets a recovery session. */}
            <Route path="/reset" element={<ResetPasswordPage />} />
            {/* Public: a shared course link works logged-out (read-only path). */}
            <Route path="/courses/:courseId" element={<CoursePage />} />
            <Route element={<RequireAuth />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/courses/new" element={<NewCoursePage />} />
              <Route path="/market" element={<MarketPage />} />
              <Route path="/pets" element={<PetsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/courses/:courseId/nodes/:nodeId"
                element={<LessonPage />}
              />
              <Route
                path="/courses/:courseId/mock-tests/new"
                element={<NewMockTestPage />}
              />
              <Route path="/mock-tests/:testId" element={<MockTestPage />} />
            </Route>
            <Route
              path="*"
              element={<p className="state state-empty">Page not found.</p>}
            />
          </Route>
        </Routes>
      </ProfileProvider>
    </BrowserRouter>
  )
}

export default App
