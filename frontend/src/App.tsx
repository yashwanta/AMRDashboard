import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import ServersPage from './pages/ServersPage'
import LogsPage from './pages/LogsPage'
import SyncPage from './pages/SyncPage'
import AutomationPage from './pages/AutomationPage'
import LoginPage from './pages/LoginPage'
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
  const auth = useAuth()
  if (!auth.isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/servers" element={<ServersPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/automation" element={<AutomationPage />} />
        </Routes>
      </main>
    </div>
  )
}
