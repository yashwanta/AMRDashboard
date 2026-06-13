import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import ServersPage from './pages/ServersPage'
import LogsPage from './pages/LogsPage'
import SyncPage from './pages/SyncPage'
import AutomationPage from './pages/AutomationPage'
import AskSiteOpsPage from './pages/AskSiteOpsPage'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import EndpointsPage from './pages/EndpointsPage'
import { AuthProvider, useAuth } from './auth'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/*" element={<ProtectedShell />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}

function ProtectedShell() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/ask" element={<AskSiteOpsPage />} />
          <Route path="/servers" element={<AdminRoute><ServersPage /></AdminRoute>} />
          <Route path="/endpoints" element={<AdminRoute><EndpointsPage /></AdminRoute>} />
          <Route path="/sync" element={<AdminRoute><SyncPage /></AdminRoute>} />
          <Route path="/automation" element={<AdminRoute requireAdmin><AutomationPage /></AdminRoute>} />
          <Route path="/setup" element={<AdminRoute requireAdmin><SetupPage /></AdminRoute>} />
        </Routes>
      </main>
    </div>
  )
}

function AdminRoute({ children, requireAdmin = false }: { children: ReactNode; requireAdmin?: boolean }) {
  const auth = useAuth()
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  if (requireAdmin && !auth.canAdmin) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}
