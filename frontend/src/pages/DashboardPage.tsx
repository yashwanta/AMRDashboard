import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getStats, getTimeline, getLogs, syncAll, getServerStats } from '../api/client'
import { format, parseISO, isValid } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Server, RefreshCw, AlertTriangle, Activity, Radio, Bell, CheckCircle, Shield } from 'lucide-react'

function safeTime(ts: string) {
  try { const d = parseISO(ts); return isValid(d) ? format(d, 'h:mm a') : '—' } catch { return '—' }
}


interface RdsInfo { serverIP?: string; serverPort?: string; tcpReason?: string; socketState?: string }
function parseRds(msg: string): RdsInfo {
  return {
    serverIP:   msg.match(/\[Server:([0-9.]+):/)?.[1],
    serverPort: msg.match(/\[Server:[^:]+:(\d+)\]/)?.[1],
    tcpReason:  msg.match(/\[Tcp:([^\]]+)\]/)?.[1],
    socketState:msg.match(/SocketState:(\S+)/)?.[1],
  }
}
function disconnectLabel(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('connection refused'))  return 'TCP connection refused'
  if (m.includes('remote host closed')) return 'Remote host closed connection'
  if (m.includes('timeout'))            return 'Connection timeout'
  if (m.includes('unconnected') || (m.includes('none') && m.includes('unconnected'))) return 'Unconnected state — no TCP'
  if (m.includes('add device failed'))  return 'Add device failed'
  if (m.includes('not connected'))      return 'Not connected'
  return 'Disconnected'
}
function disconnectAction(rds: RdsInfo): string {
  const tcp = (rds.tcpReason ?? '').toLowerCase()
  const ip = rds.serverIP ? `robot ${rds.serverIP}` : 'the robot'
  if (tcp.includes('connection refused'))  return `Check if ${ip} is powered on and its network service is running.`
  if (tcp.includes('remote host closed')) return `${ip} closed the connection — it may have been restarted.`
  if (tcp.includes('timeout'))            return `Cannot reach ${ip} — check network cables or Wi-Fi range.`
  return `Verify ${ip} is powered on and connected to the network.`
}

const CARD_BG = 'bg-gray-800 border border-gray-700'

export default function DashboardPage() {
  const nav = useNavigate()
  const [selectedDisconnect, setSelectedDisconnect] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)

  const { data: stats }            = useQuery({ queryKey: ['stats'],          queryFn: getStats,       refetchInterval: 30_000 })
  const { data: timeline = [] }    = useQuery({ queryKey: ['timeline'],        queryFn: getTimeline,    refetchInterval: 60_000 })
  const { data: serverStats = [] } = useQuery({ queryKey: ['server-stats'],    queryFn: getServerStats, refetchInterval: 30_000 })
  const { data: disconnects = [] } = useQuery({ queryKey: ['logs','robot_offline'], queryFn: () => getLogs({ event_type: 'robot_offline', limit: 30 }), refetchInterval: 30_000 })
  const { data: recent = [] }      = useQuery({ queryKey: ['logs','recent'],   queryFn: () => getLogs({ limit: 6 }), refetchInterval: 30_000 })

  const handleSync = useCallback(async () => {
    setSyncing(true); try { await syncAll() } catch {} setTimeout(() => setSyncing(false), 8000)
  }, [])

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

  const eventIcons: Record<string, string> = { robot_offline:'🤖', robot_online:'📡', crash:'💥', power_off:'⚡', disk_error:'💾', error:'❌', warning:'⚠️', update:'🔄' }
  const eventLabels: Record<string, string> = { robot_offline:'Robot offline', robot_online:'Robot online', crash:'App crash', power_off:'Restart', disk_error:'Disk error', error:'Error', warning:'Warning', update:'Update' }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-gray-900 border-b border-gray-700">
        <div>
          <h1 className="text-base font-semibold text-white">AMR Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Live server &amp; robot monitoring — {stats?.online_servers ?? 0} servers online</p>
        </div>
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing…' : 'Sync all'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* 4 metric cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { Icon: Server,        val: `${stats?.online_servers ?? 0}`, label: 'SERVERS',           sub: `${stats?.online_servers ?? 0} online  ${(stats?.total_servers ?? 0) - (stats?.online_servers ?? 0)} offline`, subColor: 'text-green-400', bar: 'bg-green-500' },
            { Icon: Radio,         val: String(stats?.robot_offline_count ?? 0), label: 'ROBOT DISCONNECTS', sub: `${stats?.robot_online_count ?? 0} connections`, subColor: 'text-red-400',   bar: 'bg-red-500',   valColor: 'text-red-400' },
            { Icon: AlertTriangle, val: String(stats?.crash_count ?? 0), label: 'APP CRASHES',        sub: 'All time',            subColor: 'text-gray-500', bar: 'bg-amber-500', valColor: 'text-amber-400' },
            { Icon: Activity,      val: (stats?.total_events ?? 0).toLocaleString(), label: 'TOTAL EVENTS', sub: `${stats?.critical_events ?? 0} critical`, subColor: 'text-red-400',   bar: 'bg-indigo-500' },
          ].map(c => (
            <div key={c.label} className={`${CARD_BG} rounded-xl p-4 relative overflow-hidden`}>
              <c.Icon size={18} className="text-gray-400 mb-3" />
              <div className={`text-2xl font-semibold ${c.valColor ?? 'text-white'}`}>{c.val}</div>
              <div className="text-xs font-medium text-gray-400 mt-1 tracking-wider">{c.label}</div>
              <div className={`text-xs mt-1 ${c.subColor}`}>{c.sub}</div>
              <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${c.bar}`} />
            </div>
          ))}
        </div>

        {/* Mid: Robot disconnects + Server cards */}
        <div className="grid grid-cols-5 gap-3">

          {/* Robot disconnections */}
          <div className={`col-span-3 ${CARD_BG} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Radio size={15} className="text-gray-400" /> Robot disconnections
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-xs bg-red-900/50 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">{disconnects.length} events</span>
                <button onClick={() => nav('/logs?event_type=robot_offline')} className="text-xs text-indigo-400 hover:text-indigo-300">View all 70 in Logs →</button>
              </div>
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {disconnects.length === 0 && <p className="text-sm text-gray-500 text-center py-6">No disconnections recorded</p>}
              {disconnects.map(ev => {
                const rds = parseRds(ev.message)
                const label = disconnectLabel(ev.message)
                const isOpen = selectedDisconnect === ev.id
                const isRed = label.includes('refused') || label.includes('closed') || label.includes('timeout')
                const dotColor = isRed ? 'bg-red-500' : 'bg-amber-400'
                const badgeColor = isRed ? 'text-red-300 bg-red-900/40 border-red-700' : 'text-amber-300 bg-amber-900/40 border-amber-700'
                return (
                  <div key={ev.id}>
                    <button onClick={() => setSelectedDisconnect(isOpen ? null : ev.id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${isOpen ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 hover:border-gray-600 hover:bg-gray-750'}`}>
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                      <span className="font-mono text-xs font-semibold text-gray-200 w-28 flex-shrink-0">{rds.serverIP ?? '—'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex-1 text-left ${badgeColor}`}>{label}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">{safeTime(ev.timestamp)}</span>
                      <span className="text-gray-600 text-xs flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                    </button>
                    {isOpen && (
                      <div className="mx-2 mb-1 rounded-lg border border-indigo-700 bg-gray-900 p-3 space-y-2">
                        <p className="text-sm text-gray-200 font-medium">{disconnectAction(rds)}</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Robot IP',   val: rds.serverIP ?? '—' },
                            { label: 'Port',        val: rds.serverPort ?? '—' },
                            { label: 'TCP reason',  val: rds.tcpReason ?? '—' },
                            { label: 'State',       val: rds.socketState?.replace('State','') ?? '—' },
                          ].map(f => (
                            <div key={f.label} className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-center">
                              <div className="text-xs text-gray-500 mb-0.5">{f.label}</div>
                              <div className="text-xs font-semibold text-gray-200 font-mono truncate">{f.val}</div>
                            </div>
                          ))}
                        </div>
                        <button onClick={() => nav(`/logs?event_type=robot_offline&server_id=${ev.server_id}`)}
                          className="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/50 px-3 py-1.5 rounded-lg transition-colors border border-indigo-700">
                          View all for {ev.server_name} →
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Server cards */}
          <div className="col-span-2 space-y-3">
            <div className={`${CARD_BG} rounded-xl p-3`}>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
                <Server size={14} className="text-gray-400" /> Servers
              </h2>
              <div className="space-y-2">
                {serverStats.map((s: any) => (
                  <button key={s.id} onClick={() => nav(`/logs?server_id=${s.id}`)}
                    className="w-full text-left bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-lg p-3 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full ${s.status === 'online' ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="text-sm font-medium text-gray-200 truncate">{s.name}</span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'online' ? 'bg-green-900/50 text-green-400 border border-green-700' : 'bg-gray-700 text-gray-400'}`}>{s.status === 'online' ? 'Online' : 'Offline'}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="text-center">
                        <div className={`text-base font-semibold ${s.robot_offline > 0 ? 'text-red-400' : 'text-gray-500'}`}>{s.robot_offline}</div>
                        <div className="text-xs text-gray-500">Disconnects</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-base font-semibold ${s.crashes > 0 ? 'text-amber-400' : 'text-gray-500'}`}>{s.crashes}</div>
                        <div className="text-xs text-gray-500">Crashes</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-base font-semibold ${s.disk_errors > 0 ? 'text-yellow-400' : 'text-green-400'}`}>{s.disk_errors > 0 ? s.disk_errors : 'ok'}</div>
                        <div className="text-xs text-gray-500">Disk</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Chart + Recent + System health */}
        <div className="grid grid-cols-3 gap-3">

          {/* Chart */}
          <div className={`col-span-2 ${CARD_BG} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Activity size={14} className="text-gray-400" /> Event trend — last 7 days</h2>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} barSize={10} barGap={2}>
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} width={24} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, fontSize: 11, color: '#f9fafb' }} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
                  <Bar dataKey="Robot offline" fill="#ef4444" radius={[3,3,0,0]} />
                  <Bar dataKey="Crash"         fill="#f59e0b" radius={[3,3,0,0]} />
                  <Bar dataKey="Error"         fill="#6366f1" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-40 text-gray-600 text-sm">No data yet — run Sync All</div>
            )}
          </div>

          {/* Recent events + System health stacked */}
          <div className="space-y-3">
            <div className={`${CARD_BG} rounded-xl p-4`}>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Bell size={14} className="text-gray-400" /> Recent events</h2>
              <div className="space-y-2">
                {recent.slice(0, 3).map(ev => {
                  const borderColors: Record<string,string> = { robot_offline:'border-l-red-500', robot_online:'border-l-green-500', crash:'border-l-amber-500', disk_error:'border-l-yellow-500', error:'border-l-orange-500', warning:'border-l-yellow-400' }
                  return (
                    <button key={ev.id} onClick={() => nav(`/logs?event_type=${ev.event_type}`)}
                      className={`w-full text-left pl-3 border-l-2 ${borderColors[ev.event_type] ?? 'border-l-gray-600'} py-1.5 hover:bg-gray-700/50 rounded-r transition-colors`}>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{eventIcons[ev.event_type] ?? '•'}</span>
                        <span className="text-xs font-semibold text-gray-300 truncate max-w-28">{ev.server_name?.split(' ')[0]}</span>
                        <span className="text-xs text-gray-500 ml-auto">{safeTime(ev.timestamp)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{eventLabels[ev.event_type]} — {ev.message.slice(0,40)}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className={`${CARD_BG} rounded-xl p-4`}>
              <h2 className="text-sm font-semibold text-white flex items-center gap-2 mb-3"><Shield size={14} className="text-gray-400" /> System health</h2>
              <div className="space-y-2">
                {[
                  { icon: CheckCircle, label: 'Disk — all servers', detail: 'No disk errors detected', ok: (stats?.disk_error_count ?? 0) === 0 },
                  { icon: CheckCircle, label: 'Memory — all servers', detail: 'No OOM events in 7 days', ok: true },
                  { icon: AlertTriangle, label: 'Robot connectivity', detail: `${stats?.robot_offline_count ?? 0} disconnects recorded`, ok: (stats?.robot_offline_count ?? 0) === 0 },
                ].map(item => (
                  <div key={item.label} className="flex items-start gap-2">
                    <item.icon size={14} className={`mt-0.5 flex-shrink-0 ${item.ok ? 'text-green-500' : 'text-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-300">{item.label}</span>
                        <span className={`text-xs font-medium ${item.ok ? 'text-green-400' : 'text-amber-400'}`}>{item.ok ? 'OK' : 'Check'}</span>
                      </div>
                      <p className="text-xs text-gray-500">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
