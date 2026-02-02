import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout'
import {
  DashboardPage,
  LoginPage,
  KeysPage,
  PlaygroundPage,
  DevLogsPage,
  LogsPage,
  InsightsPage,
  HarnessPage,
  ProvidersPage,
  SettingsPage,
  OrganizationsPage,
  TeamsPage,
  EndUsersPage,
  RoutingPage,
} from '@/pages'
import { useAuthStore } from '@/stores'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function App() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      <Route
        path="/login"
        element={
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        }
      />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/playground" element={<PlaygroundPage />} />
        <Route path="/dev-logs" element={<DevLogsPage />} />
        <Route path="/harness" element={<HarnessPage />} />
        <Route path="/organizations" element={<OrganizationsPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/end-users" element={<EndUsersPage />} />
        <Route path="/keys" element={<KeysPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/routing" element={<RoutingPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
