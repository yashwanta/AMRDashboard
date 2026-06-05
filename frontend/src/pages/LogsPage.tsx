import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getLogs, getServers } from '../api/client'
import LogsTable from '../components/logs/LogsTable'
import Header from '../components/layout/Header'
import type { LogFilters } from '../api/client'

const EVENT_TYPES: { value: string; label: string }[] = [
  { value: '',          label: 'All Types' },
  { value: 'crash',     label: '💥 App Crash' },
  { value: 'power_off', label: '⚡ Restart / Shutdown' },
  { value: 'error',     label: '❌ System Error' },
  { value: 'warning',   label: '⚠️ Warning' },
  { value: 'info',      label: 'ℹ️ Info' },
]

const SEVERITIES: { value: string; label: string }[] = [
  { value: '',         label: 'All Severities' },
  { value: 'critical', label: '🔴 Critical — Immediate attention' },
  { value: 'high',     label: '🟠 High — Action recommended' },
  { value: 'medium',   label: '🟡 Medium — Worth monitoring' },
  { value: 'low',      label: '⚪ Low — No action needed' },
]

// Quick keyword filters non-technical users care about
const QUICK_FILTERS: { label: string; keyword: string }[] = [
  { label: '💾 Out of Memory', keyword: 'out of memory' },
  { label: '💥 Segfault',      keyword: 'segfault' },
  { label: '🔌 Disk Error',    keyword: 'i/o error' },
  { label: '🛑 Kernel Panic',  keyword: 'kernel panic' },
  { label: '🔒 Login / SSH',   keyword: 'sshd' },
  { label: '⚙️ Service Fail',  keyword: 'failed to start' },
]

export default function LogsPage() {
  const [filters, setFilters]   = useState<LogFilters>({ limit: 200 })
  const [keyword, setKeyword]   = useState('')

  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => getLogs(filters),
    refetchInterval: 30_000,
  })

  const set = (k: keyof LogFilters, v: string | number | undefined) =>
    setFilters(f => ({ ...f, [k]: v || undefined }))

  // Client-side keyword filter
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
              className="input-sm"
              type="datetime-local"
              onChange={e => set('from', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              title="From date"
            />
            <input
              className="input-sm"
              type="datetime-local"
              onChange={e => set('to', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
              title="To date"
            />

            <select className="input-sm" value={filters.limit ?? 200} onChange={e => set('limit', Number(e.target.value))}>
              <option value={50}>50 rows</option>
              <option value={200}>200 rows</option>
              <option value={500}>500 rows</option>
              <option value={1000}>1000 rows</option>
            </select>

            <button className="btn-ghost text-sm" onClick={() => { setFilters({ limit: 200 }); setKeyword('') }}>
              Reset
            </button>
          </div>

          {/* Keyword search */}
          <div className="flex items-center gap-2">
            <input
              className="input-sm flex-1 max-w-xs"
              placeholder="Search messages…"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
            {keyword && (
              <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setKeyword('')}>✕ Clear</button>
            )}
          </div>

          {/* Quick-pick filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center">Quick filter:</span>
            {QUICK_FILTERS.map(q => (
              <button
                key={q.keyword}
                onClick={() => applyQuick(q.keyword)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  keyword === q.keyword
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          {keyword && <span className="ml-1 text-blue-600">matching "{keyword}"</span>}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <LogsTable events={filtered} loading={isLoading} />
        </div>
      </div>
    </div>
  )
}
