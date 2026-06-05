import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLogs, getServers } from '../api/client'
import LogsTable from '../components/logs/LogsTable'
import Header from '../components/layout/Header'
import type { LogFilters } from '../api/client'

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: '',              label: 'All Types' },
  { value: 'crash',        label: '💥 App Crash' },
  { value: 'power_off',    label: '⚡ Restart / Shutdown' },
  { value: 'robot_offline',label: '🤖🔴 Robot Offline / Disconnect' },
  { value: 'robot_online', label: '🤖🟢 Robot Online / Connected' },
  { value: 'disk_error',   label: '💾 Disk Error' },
  { value: 'error',        label: '❌ System Error' },
  { value: 'warning',      label: '⚠️ Warning' },
  { value: 'update',       label: '🔄 Update Available' },
  { value: 'info',         label: 'ℹ️ Info' },
]

const SEVERITIES: { value: string; label: string }[] = [
  { value: '',         label: 'All Severities' },
  { value: 'critical', label: '🔴 Critical — Immediate attention' },
  { value: 'high',     label: '🟠 High — Action recommended' },
  { value: 'medium',   label: '🟡 Medium — Worth monitoring' },
  { value: 'low',      label: '⚪ Low — No action needed' },
]

const QUICK_FILTERS: { label: string; keyword: string }[] = [
  { label: '🤖 Disconnect',      keyword: 'UnconnectedState' },
  { label: '🔌 Connect timeout', keyword: 'Connect timeout' },
  { label: '📡 Remote closed',   keyword: 'remote host closed' },
  { label: '💾 Out of Memory',   keyword: 'out of memory' },
  { label: '💥 Segfault',        keyword: 'segfault' },
  { label: '🛑 Kernel Panic',    keyword: 'kernel panic' },
  { label: '⚙️ Service Fail',    keyword: 'failed to start' },
  { label: '🔒 SSH Login',       keyword: 'sshd' },
]

export default function LogsPage() {
  const [filters, setFilters] = useState<LogFilters>({ limit: 200 })
  const [keyword, setKeyword] = useState('')

  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => getLogs(filters),
    refetchInterval: 30_000,
  })

  const set = (k: keyof LogFilters, v: string | number | undefined) =>
    setFilters(f => ({ ...f, [k]: v || undefined }))

  const filtered = useMemo(() => {
    if (!keyword.trim()) return events
    const kw = keyword.toLowerCase()
    return events.filter(ev => ev.message.toLowerCase().includes(kw))
  }, [events, keyword])

  function applyQuick(kw: string) {
    setKeyword(prev => prev === kw ? '' : kw)
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Logs" />
      <div className="flex-1 overflow-y-auto p-6 space-y-4">

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <select className="input-sm" value={filters.server_id ?? ''} onChange={e => set('server_id', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All Servers</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input-sm" value={filters.event_type ?? ''} onChange={e => set('event_type', e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-sm" value={filters.severity ?? ''} onChange={e => set('severity', e.target.value)}>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="Search message..."
              className="input-sm flex-1 min-w-48"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>
          {/* Quick filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center mr-1">Quick:</span>
            {QUICK_FILTERS.map(f => (
              <button
                key={f.keyword}
                onClick={() => applyQuick(f.keyword)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  keyword === f.keyword
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700 font-medium'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div className="text-xs text-gray-400 px-1">
          {isLoading ? 'Loading...' : `${filtered.length} events`}
        </div>

        {/* Table */}
        <LogsTable events={filtered} loading={isLoading} />
      </div>
    </div>
  )
}
