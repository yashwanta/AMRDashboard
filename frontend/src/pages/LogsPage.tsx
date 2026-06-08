import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { getLogs, getServers } from '../api/client'
import type { LogFilters } from '../api/client'
import LogsTable from '../components/logs/LogsTable'
import { EVENT_TYPES, SEVERITIES, SOURCE_OPTIONS } from '../eventTaxonomy'

const DATE_SHORTCUTS = [
  { label: 'Today', fn: () => ({ from: format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'Yesterday', fn: () => ({ from: format(startOfDay(subDays(new Date(), 1)), "yyyy-MM-dd'T'HH:mm"), to: format(endOfDay(subDays(new Date(), 1)), "yyyy-MM-dd'T'HH:mm") }) },
  { label: 'Last 7 days', fn: () => ({ from: format(subDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'All time', fn: () => ({ from: '', to: '' }) },
]

const inputCls = 'text-xs bg-gray-900 border border-gray-600 text-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500'

export default function LogsPage() {
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [filters, setFilters] = useState<LogFilters>(() => ({
    limit: 500,
    q: searchParams.get('q') ?? undefined,
    source: searchParams.get('source') ?? undefined,
    severity: searchParams.get('severity') ?? undefined,
    event_type: searchParams.get('event_type') ?? undefined,
    server_id: searchParams.get('server_id') ? Number(searchParams.get('server_id')) : undefined,
  }))

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters(f => ({ ...f, q: keyword.trim() || undefined }))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [keyword])

  useEffect(() => {
    setFilters(f => ({
      ...f,
      from: fromDate ? new Date(fromDate).toISOString() : undefined,
      to: toDate ? new Date(toDate).toISOString() : undefined,
    }))
  }, [fromDate, toDate])

  const { data: servers = [] } = useQuery({ queryKey: ['servers'], queryFn: getServers })
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['logs', filters],
    queryFn: () => getLogs(filters),
    refetchInterval: 30_000,
  })

  const sourceOptions = useMemo(() => {
    const seen = new Set<string>(SOURCE_OPTIONS.map(s => s.value))
    const discovered = events
      .map(ev => ev.source)
      .filter(source => source && !seen.has(source))
      .map(source => ({ value: source, label: source }))
    return [...SOURCE_OPTIONS, ...discovered]
  }, [events])

  const set = (k: keyof LogFilters, v: string | number | undefined) =>
    setFilters(f => ({ ...f, [k]: v || undefined }))

  function applyShortcut(s: typeof DATE_SHORTCUTS[0]) {
    const r = s.fn()
    setFromDate(r.from)
    setToDate(r.to)
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">Logs</h1>
        <p className="text-xs text-gray-400 mt-0.5">Review robot, server, host, VM, power, network, and unknown events</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select className={inputCls} value={filters.server_id ?? ''} onChange={e => set('server_id', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All servers</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={filters.source ?? ''} onChange={e => set('source', e.target.value)}>
              {sourceOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className={inputCls} value={filters.event_type ?? ''} onChange={e => set('event_type', e.target.value)}>
              {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <select className={inputCls} value={filters.severity ?? ''} onChange={e => set('severity', e.target.value)}>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input
              type="search"
              placeholder="Search logs, source, server..."
              className={`${inputCls} placeholder-gray-500`}
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-gray-400 font-medium">Date range</span>
            <input type="datetime-local" className={inputCls} value={fromDate} onChange={e => setFromDate(e.target.value)} />
            <span className="text-xs text-gray-500">to</span>
            <input type="datetime-local" className={inputCls} value={toDate} onChange={e => setToDate(e.target.value)} />
            <div className="flex gap-1.5 flex-wrap">
              {DATE_SHORTCUTS.map(s => (
                <button key={s.label} onClick={() => applyShortcut(s)}
                  className="text-xs px-2.5 py-1 rounded-md border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
            {(fromDate || toDate || keyword || filters.source || filters.event_type || filters.severity || filters.server_id) && (
              <button onClick={() => {
                setFromDate('')
                setToDate('')
                setKeyword('')
                setFilters({ limit: 500 })
              }} className="text-xs text-red-400 hover:text-red-300">
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {isLoading ? 'Loading...' : `${events.length} events`}
            {fromDate && <span className="ml-2 text-blue-400">from {new Date(fromDate).toLocaleDateString()}</span>}
            {toDate && <span className="ml-1 text-blue-400">to {new Date(toDate).toLocaleDateString()}</span>}
          </span>
        </div>

        <LogsTable events={events} loading={isLoading} />
      </div>
    </div>
  )
}
