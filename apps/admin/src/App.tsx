import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout'
import { DashboardPage, LoginPage, PlaceholderPage } from '@/pages'
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
        <Route
          path="/insights"
          element={
            <PlaceholderPage
              title="Insights"
              description="Analytics and usage patterns"
            />
          }
        />
        <Route
          path="/playground"
          element={
            <PlaceholderPage
              title="Playground"
              description="Test your LLM gateway with an interactive chat interface"
            />
          }
        />
        <Route
          path="/dev-logs"
          element={
            <PlaceholderPage
              title="Dev Logs"
              description="Raw request and response data for debugging"
            />
          }
        />
        <Route
          path="/harness"
          element={
            <PlaceholderPage
              title="Agentic Harness"
              description="Debug and tune your AI agent workflows"
            />
          }
        />
        <Route
          path="/keys"
          element={
            <PlaceholderPage
              title="API Keys"
              description="Manage your gateway API keys"
            />
          }
        />
        <Route
          path="/providers"
          element={
            <PlaceholderPage
              title="Providers"
              description="Configure and monitor LLM providers"
            />
          }
        />
        <Route
          path="/logs"
          element={
            <PlaceholderPage
              title="Request Logs"
              description="View and search request history"
            />
          }
        />
        <Route
          path="/settings"
          element={
            <PlaceholderPage
              title="Settings"
              description="System-wide configuration"
            />
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
