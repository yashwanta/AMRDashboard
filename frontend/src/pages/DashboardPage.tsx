import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Server, AlertTriangle, Zap, Activity, TrendingUp, Wifi, WifiOff, RefreshCw, HardDrive, Radio } from 'lucide-react'
import { getStats, getTimeline, getLogs, syncAll } from '../api/client'
import EventChart from '../components/dashboard/EventChart'
import Header from '../components/layout/Header'
import type { LogEvent } from '../types'
import { formatDistanceToNow, parseISO, isValid, format } from 'date-fns'

function safeRelative(ts: string) {
  try { const d = parseISO(ts); return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—' } catch { return '—' }
}
function safeFormat(ts: string) {
  try { const d = parseISO(ts); return isValid(d) ? format(d, 'MMM d, HH:mm:ss') : '—' } catch { return '—' }
}

function disconnectReason(msg: string): { label: string; color: string } {
  if (msg.includes('remote host closed')) return { label: 'Remote host closed', color: 'text-red-600 bg-red-50 border-red-200' }
  if (msg.includes('Connect timeout') || msg.includes('timeout')) return { label: 'Connection timeout', color: 'text-orange-600 bg-orange-50 border-orange-200' }
  if (msg.includes('Add device failed')) return { label: 'Add device failed', color: 'text-red-600 bg-red-50 border-red-200' }
  if (msg.includes('Not connected')) return { label: 'Not connected', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
  if (msg.includes('UnconnectedState')) return { label: 'Unconnected state', color: 'text-orange-600 bg-orange-50 border-orange-200' }
  if (msg.includes('ClosingState')) return { label: 'Closing state', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' }
  if (msg.includes('slotTcpError') || msg.includes('setLastError')) return { label: 'TCP error', color: 'text-red-600 bg-red-50 border-red-200' }
  return { label: 'Unknown', color: 'text-gray-600 bg-gray-50 border-gray-200' }
}

function extractIP(msg: string): string {
  const m = msg.match(/10\.\d+\.\d+\.\d+/)
  return m ? m[0] : ''
}

function StatCard({ label, value, sub, icon, accent }: { label: string; value: number; sub?: string; icon: string; accent: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${accent}`}>{icon}</div>
      <div>
        <div className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</div>
        <div className="text-xs font-medium text-gray-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  )
}

function RobotDisconnectCard({ ev, onClick, selected }: { ev: LogEvent; onClick: () => void; selected: boolean }) {
  const reason = disconnectReason(ev.message)
  const ip = extractIP(ev.message)
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-3 transition-all ${selected ? 'border-indigo-400 bg-indigo-50 shadow-md' : 'border-red-100 bg-white hover:border-red-300 hover:shadow-sm'}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl mt-0.5">🤖</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-gray-700">{ev.server_name}</span>
            {ip && <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{ip}</span>}
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${reason.color}`}>{reason.label}</span>
            <span className="text-xs text-gray-400 ml-auto">{safeRelative(ev.timestamp)}</span>
          </div>
          {selected && (
            <div className="mt-2 text-xs text-gray-600 bg-white rounded-lg p-2 border border-gray-200 font-mono break-all">
              {ev.message.slice(0, 300)}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

export default function DashboardPage() {
  const [selectedDisconnect, setSelectedDisconnect] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery({
    queryKey: ['stats'], queryFn: getStats, refetchInterval: 30_000,
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['timeline'], queryFn: getTimeline, refetchInterval: 60_000,
  })
  const { data: disconnects = [] } = useQuery({
    queryKey: ['logs', 'robot_offline'],
    queryFn: () => getLogs({ event_type: 'robot_offline', limit: 50 }),
    refetchInterval: 30_000,
  })
  const { data: recent = [] } = useQuery({
    queryKey: ['logs', 'recent'],
    queryFn: () => getLogs({ limit: 10 }),
    refetchInterval: 30_000,
  })

  async function handleSyncAll() {
    setSyncing(true)
    try { await syncAll() } catch {}
    setTimeout(() => { setSyncing(false); refetchStats() }, 5000)
  }

  if (statsLoading) return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
      </div>
    </div>
  )

  if (statsError) return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 flex items-center justify-center text-red-500 text-sm">Backend unreachable — make sure containers are running.</div>
    </div>
  )

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div>
          <h1 className="text-xl font-bold text-gray-800">AMR Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Live server & robot monitoring</p>
        </div>
        <button
          onClick={handleSyncAll}
          disabled={syncing}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync All'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Server status pills */}
        <div className="flex gap-3">
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
            <Wifi size={14} className="text-green-600" />
            <span className="text-sm text-green-700 font-semibold">{stats?.online_servers ?? 0} Servers Online</span>
          </div>
          {(stats?.total_servers ?? 0) - (stats?.online_servers ?? 0) > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
              <WifiOff size={14} className="text-red-500" />
              <span className="text-sm text-red-600 font-semibold">{(stats?.total_servers ?? 0) - (stats?.online_servers ?? 0)} Offline</span>
            </div>
          )}
        </div>

        {/* Stat cards row 1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Servers"  value={stats?.total_servers ?? 0}   icon="🖥️" accent="bg-blue-50"   sub={`${stats?.online_servers ?? 0} online`} />
          <StatCard label="App Crashes"    value={stats?.crash_count ?? 0}     icon="💥" accent="bg-red-50"    sub="all time" />
          <StatCard label="Server Reboots" value={stats?.power_off_count ?? 0} icon="⚡" accent="bg-orange-50" sub="all time" />
          <StatCard label="Total Events"   value={stats?.total_events ?? 0}    icon="📊" accent="bg-purple-50" sub={`${stats?.critical_events ?? 0} critical`} />
        </div>

        {/* Stat cards row 2 — AMR specific */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 text-white shadow-sm">
            <div className="text-3xl mb-1">🤖</div>
            <div className="text-3xl font-bold">{stats?.robot_offline_count ?? 0}</div>
            <div className="text-sm opacity-90 mt-1">Robot Disconnections</div>
            <div className="text-xs opacity-70 mt-0.5">Click below to see reasons</div>
          </div>
          <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-2xl p-5 text-white shadow-sm">
            <div className="text-3xl mb-1">📡</div>
            <div className="text-3xl font-bold">{stats?.robot_online_count ?? 0}</div>
            <div className="text-sm opacity-90 mt-1">Robot Connections</div>
            <div className="text-xs opacity-70 mt-0.5">Successful connects</div>
          </div>
          <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-2xl p-5 text-white shadow-sm">
            <div className="text-3xl mb-1">💾</div>
            <div className="text-3xl font-bold">{stats?.disk_error_count ?? 0}</div>
            <div className="text-sm opacity-90 mt-1">Disk Errors</div>
            <div className="text-xs opacity-70 mt-0.5">I/O, filesystem, space</div>
          </div>
        </div>

        {/* Robot Disconnections — clickable list */}
        {disconnects.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-lg">🤖🔴</span>
              <h2 className="font-bold text-gray-700">Robot Disconnections</h2>
              <span className="ml-auto text-xs text-gray-400">Click any row to see full reason</span>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {disconnects.map(ev => (
                <RobotDisconnectCard
                  key={ev.id}
                  ev={ev}
                  selected={selectedDisconnect === ev.id}
                  onClick={() => setSelectedDisconnect(selectedDisconnect === ev.id ? null : ev.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Chart + Recent events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-indigo-500" />
              <h2 className="font-semibold text-gray-700 text-sm">Event Trend (7 days)</h2>
            </div>
            <EventChart data={timeline} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 text-sm mb-4">Recent Events</h2>
            <div className="space-y-2">
              {recent.map(ev => {
                const icons: Record<string, string> = { crash: '💥', power_off: '⚡', robot_offline: '🤖🔴', robot_online: '🤖🟢', disk_error: '💾', error: '❌', warning: '⚠️', update: '🔄', info: 'ℹ️' }
                const colors: Record<string, string> = { crash: 'border-l-red-500', power_off: 'border-l-orange-400', robot_offline: 'border-l-red-400', robot_online: 'border-l-green-400', disk_error: 'border-l-yellow-500', error: 'border-l-orange-300', warning: 'border-l-yellow-300', info: 'border-l-blue-300' }
                return (
                  <div key={ev.id} className={`pl-3 border-l-2 ${colors[ev.event_type] ?? 'border-l-gray-200'}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm">{icons[ev.event_type] ?? '•'}</span>
                      <span className="text-xs font-semibold text-gray-600">{ev.server_name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{safeRelative(ev.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.message.slice(0, 80)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
