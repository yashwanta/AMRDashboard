import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import ServersPage from './pages/ServersPage'
import LogsPage from './pages/LogsPage'
import SyncPage from './pages/SyncPage'

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1 } },
})

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <div className="flex h-screen bg-gray-50 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden flex flex-col">
            <Routes>
              <Route path="/"        element={<DashboardPage />} />
              <Route path="/servers" element={<ServersPage />} />
              <Route path="/logs"    element={<LogsPage />} />
              <Route path="/sync"    element={<SyncPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
