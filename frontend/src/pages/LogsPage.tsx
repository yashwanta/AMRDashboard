import { useState, useMemo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { getLogs, getServers } from '../api/client'
import LogsTable from '../components/logs/LogsTable'
import type { LogFilters } from '../api/client'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

const EVENT_TYPES = [
  { value: '',              label: 'All Types' },
  { value: 'power_off',    label: '⚡ Server Restart / Shutdown' },
  { value: 'crash',        label: '💥 App Crash' },
  { value: 'robot_offline',label: '🤖 Robot Offline' },
  { value: 'robot_online', label: '📡 Robot Online' },
  { value: 'disk_error',   label: '💾 Disk Error' },
  { value: 'error',        label: '❌ System Error' },
  { value: 'warning',      label: '⚠️ Warning' },
  { value: 'update',       label: '🔄 Update Available' },
]

const SEVERITIES = [
  { value: '',         label: 'All Severities' },
  { value: 'critical', label: '🔴 Critical' },
  { value: 'high',     label: '🟠 High' },
  { value: 'medium',   label: '🟡 Medium' },
  { value: 'low',      label: '⚪ Low' },
]

const QUICK_FILTERS = [
  { label: '🤖 Disconnect',      keyword: 'UnconnectedState' },
  { label: '🔌 Timeout',         keyword: 'Connect timeout' },
  { label: '📡 Remote closed',   keyword: 'remote host closed' },
  { label: '💾 Out of Memory',   keyword: 'out of memory' },
  { label: '💥 Segfault',        keyword: 'segfault' },
  { label: '🛑 Kernel Panic',    keyword: 'kernel panic' },
  { label: '⚙️ Service Fail',    keyword: 'failed to start' },
  { label: '🔒 SSH Login',       keyword: 'sshd' },
]

// Quick date shortcuts
const DATE_SHORTCUTS = [
  { label: 'Today',      fn: () => ({ from: format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'Yesterday',  fn: () => ({ from: format(startOfDay(subDays(new Date(),1)), "yyyy-MM-dd'T'HH:mm"), to: format(endOfDay(subDays(new Date(),1)), "yyyy-MM-dd'T'HH:mm") }) },
  { label: '2 days ago', fn: () => ({ from: format(startOfDay(subDays(new Date(),2)), "yyyy-MM-dd'T'HH:mm"), to: format(endOfDay(subDays(new Date(),2)), "yyyy-MM-dd'T'HH:mm") }) },
  { label: 'Last 7 days',fn: () => ({ from: format(subDays(new Date(),7), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'All time',   fn: () => ({ from: '', to: '' }) },
]

const inputCls = "text-xs bg-gray-900 border border-gray-600 text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"

export default function LogsPage() {
  const [searchParams] = useSearchParams()
  const [filters, setFilters] = useState<LogFilters>(() => ({
    limit: 500,
    event_type: searchParams.get('event_type') ?? undefined,
    server_id: searchParams.get('server_id') ? Number(searchParams.get('server_id')) : undefined,
  }))
  const [keyword, setKeyword] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate]   = useState('')

  useEffect(() => {
    const et  = searchParams.get('event_type')
    const sid = searchParams.get('server_id')
    if (et || sid) setFilters(f => ({ ...f, event_type: et ?? undefined, server_id: sid ? Number(sid) : undefined }))
  }, [searchParams.toString()])

  // Apply date range to filters
  useEffect(() => {
    setFilters(f => ({
      ...f,
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to:   toDate   ? new Date(toDate).toISOString()   : undefined,
    }))
  }, [fromDate, toDate])

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

  function applyShortcut(s: typeof DATE_SHORTCUTS[0]) {
    const r = s.fn()
    setFromDate(r.from); setToDate(r.to)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">Logs</h1>
        <p className="text-xs text-gray-400 mt-0.5">Browse and filter all server events</p>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4">

        {/* Filters */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3">

          {/* Row 1: dropdowns + search */}
          <div className="flex flex-wrap gap-3">
            <select className={inputCls} value={filters.server_id ?? ''} onChange={e => set('server_id', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All Servers</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={filters.event_type ?? ''} onChange={e => set('event_type', e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className={inputCls} value={filters.severity ?? ''} onChange={e => set('severity', e.target.value)}>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input type="text" placeholder="Search message..." className={`${inputCls} flex-1 min-w-48 placeholder-gray-500`}
              value={keyword} onChange={e => setKeyword(e.target.value)} />
          </div>

          {/* Row 2: date range */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400 font-medium">Date range:</span>
            <div className="flex items-center gap-2">
              <input type="datetime-local" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <span className="text-xs text-gray-500">to</span>
              <input type="datetime-local" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DATE_SHORTCUTS.map(s => (
                <button key={s.label} onClick={() => applyShortcut(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(''); setToDate('') }}
                className="text-xs text-red-400 hover:text-red-300 ml-1">✕ Clear</button>
            )}
          </div>

          {/* Row 3: quick keyword filters */}
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center mr-1">Quick:</span>
            {QUICK_FILTERS.map(f => (
              <button key={f.keyword} onClick={() => setKeyword(prev => prev === f.keyword ? '' : f.keyword)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  keyword === f.keyword
                    ? 'bg-indigo-900/50 border-indigo-600 text-indigo-300 font-medium'
                    : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results summary */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {isLoading ? 'Loading...' : `${filtered.length} events`}
            {fromDate && <span className="ml-2 text-indigo-400">from {new Date(fromDate).toLocaleDateString()}</span>}
            {toDate   && <span className="ml-1 text-indigo-400">to {new Date(toDate).toLocaleDateString()}</span>}
          </span>
        </div>

        <LogsTable events={filtered} loading={isLoading} />
      </div>
    </div>
  )
}
