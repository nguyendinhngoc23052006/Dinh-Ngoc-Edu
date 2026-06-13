import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { ProfileProvider } from './hooks/ProfileProvider'
import AppLayout from './components/layout/AppLayout'
import RequireAuth from './components/auth/RequireAuth'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ExplorePage from './pages/ExplorePage'
import NewCoursePage from './pages/NewCoursePage'
import CoursePage from './pages/CoursePage'
import LessonPage from './pages/LessonPage'
import NewMockTestPage from './pages/NewMockTestPage'
import MockTestPage from './pages/MockTestPage'
import MarketPage from './pages/MarketPage'
import PetsPage from './pages/PetsPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
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
