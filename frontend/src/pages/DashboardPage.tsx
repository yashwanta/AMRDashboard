import { useQuery } from '@tanstack/react-query'
import { Server, AlertTriangle, Zap, Activity, TrendingUp, Wifi, RefreshCw, HardDrive } from 'lucide-react'
import { getStats, getTimeline, getLogs } from '../api/client'
import StatsCard from '../components/dashboard/StatsCard'
import EventChart from '../components/dashboard/EventChart'
import RecentEvents from '../components/dashboard/RecentEvents'
import Header from '../components/layout/Header'

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useQuery({
    queryKey: ['stats'], queryFn: getStats, refetchInterval: 30_000,
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['timeline'], queryFn: getTimeline, refetchInterval: 60_000,
  })
  const { data: recent = [] } = useQuery({
    queryKey: ['logs', 'recent'],
    queryFn: () => getLogs({ limit: 20 }),
    refetchInterval: 30_000,
  })

  if (statsLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Dashboard" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading dashboard...
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Dashboard" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 font-medium mb-1">Could not reach the backend API.</p>
            <p className="text-sm text-gray-500">Make sure all containers are running and try refreshing.</p>
          </div>
        </div>
      </div>
    )
  }

  const noServers = (stats?.total_servers ?? 0) === 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {noServers && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <span className="font-semibold">No servers configured.</span> Go to the <span className="font-semibold">Servers</span> page to add a server, then run a sync to see events here.
          </div>
        )}

        {/* Server health row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Total Servers"  value={stats?.total_servers ?? 0}  Icon={Server}        color="blue"   sub={`${stats?.online_servers ?? 0} online`} />
          <StatsCard label="Crashes"        value={stats?.crash_count ?? 0}    Icon={AlertTriangle} color="red"    sub="all time" />
          <StatsCard label="Power Offs"     value={stats?.power_off_count ?? 0} Icon={Zap}          color="orange" sub="all time" />
          <StatsCard label="Total Events"   value={stats?.total_events ?? 0}   Icon={Activity}      color="purple" sub={`${stats?.critical_events ?? 0} critical`} />
        </div>

        {/* AMR robot row */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <span className="text-3xl">🤖🔴</span>
            <div>
              <div className="text-2xl font-bold text-red-600">{stats?.robot_offline_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">Robot Disconnects</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <span className="text-3xl">🤖🟢</span>
            <div>
              <div className="text-2xl font-bold text-green-600">{stats?.robot_online_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">Robot Connections</div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <HardDrive className="w-8 h-8 text-yellow-500 shrink-0" />
            <div>
              <div className="text-2xl font-bold text-yellow-600">{stats?.disk_error_count ?? 0}</div>
              <div className="text-xs text-gray-500 mt-0.5">Disk Errors</div>
            </div>
          </div>
        </div>

        {/* Online vs offline pills */}
        {stats && stats.total_servers > 0 && (
          <div className="flex gap-3">
            <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-4 py-2">
              <Wifi size={14} className="text-green-600" />
              <span className="text-sm text-green-700 font-medium">{stats.online_servers} Online</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-gray-400" />
              <span className="text-sm text-gray-600 font-medium">{stats.total_servers - stats.online_servers} Offline / Unknown</span>
            </div>
          </div>
        )}

        {/* Chart + recent events */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-gray-500" />
              <h2 className="font-semibold text-gray-700 text-sm">Event Trend (7 days)</h2>
            </div>
            <EventChart data={timeline} />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-700 text-sm mb-4">Recent Events</h2>
            <RecentEvents events={recent} />
          </div>
        </div>

      </div>
    </div>
  )
}
