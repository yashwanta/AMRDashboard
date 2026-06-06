import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getLogs, getServers } from '../api/client'
import LogsTable from '../components/logs/LogsTable'
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
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState<LogFilters>(() => ({
    limit: 200,
    event_type: searchParams.get('event_type') ?? undefined,
    server_id: searchParams.get('server_id') ? Number(searchParams.get('server_id')) : undefined,
  }))
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    const et = searchParams.get('event_type')
    const sid = searchParams.get('server_id')
    if (et || sid) {
      setFilters(f => ({ ...f, event_type: et ?? undefined, server_id: sid ? Number(sid) : undefined }))
    }
  }, [searchParams.toString()])

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
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Filters */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <select className="input-sm bg-gray-900 border-gray-600 text-gray-200" value={filters.server_id ?? ''} onChange={e => set('server_id', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All Servers</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className="input-sm bg-gray-900 border-gray-600 text-gray-200" value={filters.event_type ?? ''} onChange={e => set('event_type', e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className="input-sm bg-gray-900 border-gray-600 text-gray-200" value={filters.severity ?? ''} onChange={e => set('severity', e.target.value)}>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input
              type="text"
              placeholder="Search message..."
              className="input-sm flex-1 min-w-48 bg-gray-900 border-gray-600 text-gray-200 placeholder-gray-500"
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
                    ? 'bg-indigo-900/50 border-indigo-600 text-indigo-300 font-medium'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div className="text-xs text-gray-500 px-1">
          {isLoading ? 'Loading...' : `${filtered.length} events`}
        </div>

        {/* Table */}
        <LogsTable events={filtered} loading={isLoading} />
      </div>
    </div>
  )
}
