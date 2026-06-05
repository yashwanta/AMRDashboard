import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getStats, getTimeline, getLogs, syncAll, getServerStats } from '../api/client'
import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

function safeRelative(ts: string) {
  try { const d = parseISO(ts); return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : '—' } catch { return '—' }
}
function safeTime(ts: string) {
  try { const d = parseISO(ts); return isValid(d) ? format(d, 'h:mm a') : '—' } catch { return '—' }
}

interface RdsInfo { serverIP?: string; serverPort?: string; tcpReason?: string; socketState?: string }
function parseRds(msg: string): RdsInfo {
  const ip   = msg.match(/\[Server:([0-9.]+):(\d+)\]/)
  const tcp  = msg.match(/\[Tcp:([^\]]+)\]/)
  const sock = msg.match(/SocketState:(\S+)/)
  return { serverIP: ip?.[1], serverPort: ip?.[2], tcpReason: tcp?.[1], socketState: sock?.[1] }
}
function disconnectLabel(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('connection refused'))    return 'Connection refused'
  if (m.includes('remote host closed'))   return 'Remote host closed'
  if (m.includes('timeout'))              return 'Timeout'
  if (m.includes('unconnected') || m.includes('none')) return 'Lost connection'
  if (m.includes('add device failed'))    return 'Add device failed'
  if (m.includes('not connected'))        return 'Not connected'
  return 'Disconnected'
}
function disconnectDetail(rds: RdsInfo): string {
  const tcp = (rds.tcpReason ?? '').toLowerCase()
  const ip = rds.serverIP ? `Robot ${rds.serverIP}` : 'Robot'
  if (tcp.includes('connection refused'))  return `${ip} rejected the connection — check if the robot is powered on`
  if (tcp.includes('remote host closed')) return `${ip} closed the connection — may have been restarted or shutdown`
  if (tcp.includes('timeout'))            return `Could not reach ${ip} in time — check network or robot power`
  if (tcp.includes('none'))               return `${ip} is unreachable — no active TCP connection`
  return `${ip} disconnected — reason: ${rds.tcpReason ?? 'unknown'}`
}

export default function DashboardPage() {
  const nav = useNavigate()
  const [selectedDisconnect, setSelectedDisconnect] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  const { data: stats }       = useQuery({ queryKey: ['stats'],        queryFn: getStats,       refetchInterval: 30_000 })
  const { data: timeline = [] } = useQuery({ queryKey: ['timeline'],   queryFn: getTimeline,    refetchInterval: 60_000 })
  const { data: serverStats = [] } = useQuery({ queryKey: ['server-stats'], queryFn: getServerStats, refetchInterval: 30_000 })
  const { data: disconnects = [] } = useQuery({ queryKey: ['logs','robot_offline'], queryFn: () => getLogs({ event_type: 'robot_offline', limit: 30 }), refetchInterval: 30_000 })
  const { data: recent = [] }  = useQuery({ queryKey: ['logs','recent'], queryFn: () => getLogs({ limit: 8 }), refetchInterval: 30_000 })

  const handleSync = useCallback(async () => {
    setSyncing(true); try { await syncAll() } catch {} setTimeout(() => setSyncing(false), 8000)
  }, [])

  // Build chart data: group timeline by day
  const chartData = (() => {
    const map: Record<string, Record<string, number>> = {}
    timeline.forEach(p => {
      const day = p.hour?.slice(0, 10) ?? ''
      if (!map[day]) map[day] = {}
      map[day][p.event_type] = (map[day][p.event_type] ?? 0) + p.count
    })
    return Object.entries(map).slice(-7).map(([day, counts]) => ({
      day: day ? format(new Date(day + 'T12:00:00'), 'MMM d') : '',
      'Robot offline': counts['robot_offline'] ?? 0,
      Crash: counts['crash'] ?? 0,
      Error: counts['error'] ?? 0,
    }))
  })()

  const eventIcons: Record<string, string> = {
    robot_offline: '🤖', robot_online: '📡', crash: '💥', power_off: '⚡', disk_error: '💾', error: '❌', warning: '⚠️', update: '🔄', info: 'ℹ️'
  }
  const eventLabels: Record<string, string> = {
    robot_offline: 'Robot offline', robot_online: 'Robot online', crash: 'App crash', power_off: 'Restart', disk_error: 'Disk error', error: 'Error', warning: 'Warning', update: 'Update', info: 'Info'
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100">
        <div>
          <h1 className="text-lg font-semibold text-gray-800">AMR Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats?.online_servers ?? 0} of {stats?.total_servers ?? 0} servers online &nbsp;·&nbsp; {stats?.total_events?.toLocaleString() ?? 0} total events
          </p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60">
          <span className={syncing ? 'animate-spin inline-block' : ''}>↻</span>
          {syncing ? 'Syncing…' : 'Sync All'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">

        {/* Metric row */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Servers online', value: `${stats?.online_servers ?? 0}/${stats?.total_servers ?? 0}`, sub: 'All connected', bar: 'bg-green-500', color: 'text-green-700' },
            { label: 'Robot disconnects', value: stats?.robot_offline_count ?? 0, sub: `${stats?.robot_online_count ?? 0} connections`, bar: 'bg-red-500', color: 'text-red-700' },
            { label: 'App crashes', value: stats?.crash_count ?? 0, sub: 'All time', bar: 'bg-amber-500', color: 'text-amber-700' },
            { label: 'Critical events', value: stats?.critical_events ?? 0, sub: `${stats?.total_events?.toLocaleString() ?? 0} total`, bar: 'bg-indigo-500', color: 'text-indigo-700' },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4 relative overflow-hidden">
              <div className={`text-2xl font-semibold ${c.color}`}>{String(c.value)}</div>
              <div className="text-xs font-medium text-gray-500 mt-1 uppercase tracking-wide">{c.label}</div>
              <div className="text-xs text-gray-400 mt-1">{c.sub}</div>
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${c.bar}`} />
            </div>
          ))}
        </div>

        {/* Mid row: Robot disconnects + Server cards */}
        <div className="grid grid-cols-5 gap-4">

          {/* Robot disconnect list */}
          <div className="col-span-3 bg-white rounded-xl border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">🤖 Robot Disconnections</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full font-medium">{disconnects.length} shown</span>
                <button onClick={() => nav('/logs?event_type=robot_offline')} className="text-xs text-indigo-500 hover:text-indigo-700">View all →</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {disconnects.length === 0 && <p className="text-sm text-gray-400 text-center py-6">No robot disconnections recorded</p>}
              {disconnects.map(ev => {
                const rds = parseRds(ev.message)
                const label = disconnectLabel(ev.message)
                const isOpen = selectedDisconnect === ev.id
                const labelColor = label.includes('refused') || label.includes('closed') ? 'bg-red-50 text-red-600 border-red-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                return (
                  <div key={ev.id}>
                    <button onClick={() => setSelectedDisconnect(isOpen ? null : ev.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${isOpen ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${label.includes('refused') || label.includes('closed') ? 'bg-red-500' : 'bg-amber-500'}`} />
                      <span className="font-mono text-xs font-semibold text-gray-700 w-28 flex-shrink-0">{rds.serverIP ?? '—'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${labelColor}`}>{label}</span>
                      <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{ev.server_name} · {safeTime(ev.timestamp)}</span>
                      <span className="text-gray-300 text-xs flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="mx-2 mb-1 rounded-lg border border-indigo-200 bg-white p-3 space-y-2">
                        <p className="text-sm text-gray-800 font-medium">{disconnectDetail(rds)}</p>
                        <div className="grid grid-cols-4 gap-2 mt-2">
                          {[
                            { label: 'Robot IP', val: rds.serverIP ?? '—' },
                            { label: 'Port', val: rds.serverPort ?? '—' },
                            { label: 'TCP reason', val: rds.tcpReason ?? '—' },
                            { label: 'State', val: rds.socketState?.replace('State','') ?? '—' },
                          ].map(f => (
                            <div key={f.label} className="bg-gray-50 rounded-lg p-2 text-center">
                              <div className="text-xs text-gray-400 mb-0.5">{f.label}</div>
                              <div className="text-xs font-semibold text-gray-700 font-mono truncate">{f.val}</div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => nav(`/logs?event_type=robot_offline&server_id=${ev.server_id}`)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                            View all for {ev.server_name} →
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Server breakdown cards */}
          <div className="col-span-2 space-y-3">
            {serverStats.map((s: any) => (
              <button key={s.id} onClick={() => nav(`/logs?server_id=${s.id}`)}
                className="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-indigo-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm font-semibold text-gray-700 truncate">{s.name}</span>
                  <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'online' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className={`text-lg font-semibold ${s.robot_offline > 0 ? 'text-red-600' : 'text-gray-400'}`}>{s.robot_offline}</div>
                    <div className="text-xs text-gray-400">Disconnects</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-semibold ${s.crashes > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{s.crashes}</div>
                    <div className="text-xs text-gray-400">Crashes</div>
                  </div>
                  <div className="text-center">
                    <div className={`text-lg font-semibold ${s.disk_errors > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{s.disk_errors > 0 ? s.disk_errors : '✓'}</div>
                    <div className="text-xs text-gray-400">Disk</div>
                  </div>
                </div>
                <p className="text-xs text-indigo-400 mt-2 text-right">View logs →</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chart + Recent events */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Event trend — last 7 days</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barSize={12} barGap={2}>
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #e5e7eb' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Robot offline" fill="#E24B4A" radius={[3,3,0,0]} />
                  <Bar dataKey="Crash"         fill="#EF9F27" radius={[3,3,0,0]} />
                  <Bar dataKey="Error"         fill="#378ADD" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-44 text-gray-300 text-sm">No data yet — run Sync All</div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent events</h2>
            <div className="space-y-0">
              {recent.map(ev => {
                const borderColors: Record<string,string> = { robot_offline: 'border-l-red-400', robot_online: 'border-l-green-400', crash: 'border-l-orange-400', disk_error: 'border-l-yellow-400', error: 'border-l-orange-300', warning: 'border-l-yellow-300' }
                return (
                  <button key={ev.id} onClick={() => nav(`/logs?event_type=${ev.event_type}`)}
                    className={`w-full text-left pl-3 border-l-2 ${borderColors[ev.event_type] ?? 'border-l-gray-200'} py-2 hover:bg-gray-50 rounded-r transition-colors`}>
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="text-sm">{eventIcons[ev.event_type] ?? '•'}</span>
                      <span className="text-xs font-semibold text-gray-600 truncate max-w-24">{ev.server_name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{safeRelative(ev.timestamp)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{eventLabels[ev.event_type] ?? ev.event_type} — {ev.message.slice(0,50)}</p>
                  </button>
                )
              })}
              {recent.length === 0 && <p className="text-sm text-gray-400 text-center py-8">No events yet</p>}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
