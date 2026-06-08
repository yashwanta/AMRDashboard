import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { deepSync, getIncidentSummary, getLogs, getServers } from '../api/client'
import type { LogFilters } from '../api/client'
import type { IncidentSummary } from '../types'
import LogsTable from '../components/logs/LogsTable'
import { EVENT_TYPES, SEVERITIES, SOURCE_OPTIONS } from '../eventTaxonomy'

const DATE_SHORTCUTS = [
  { label: 'Today', fn: () => ({ from: format(startOfDay(new Date()), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'Yesterday', fn: () => ({ from: format(startOfDay(subDays(new Date(), 1)), "yyyy-MM-dd'T'HH:mm"), to: format(endOfDay(subDays(new Date(), 1)), "yyyy-MM-dd'T'HH:mm") }) },
  { label: 'Last 7 days', fn: () => ({ from: format(subDays(new Date(), 7), "yyyy-MM-dd'T'HH:mm"), to: '' }) },
  { label: 'All time', fn: () => ({ from: '', to: '' }) },
]

const inputCls = 'text-xs bg-gray-900 border border-gray-600 text-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500'

const QUICK_FILTERS = [
  { label: 'Out of Memory', event_type: 'host_memory_exhaustion', q: 'oom out of memory' },
  { label: 'VM Killed', event_type: 'vm_killed_by_oom', q: 'killed process' },
  { label: 'Server Reboot', event_type: 'ubuntu_server_reboot', q: 'reboot' },
  { label: 'Server Shutdown', event_type: 'ubuntu_server_shutdown', q: 'shutdown' },
  { label: 'Backup', event_type: 'backup_job', q: 'backup vzdump' },
  { label: 'HA', event_type: 'ha_action', q: 'ha-manager pve-ha' },
  { label: 'Robot Offline', event_type: 'robot_offline', q: 'UnconnectedState disconnect' },
  { label: 'App Crash', event_type: 'crash', q: 'segfault fatal core dumped' },
  { label: 'SSH Login', event_type: 'ssh_login_activity', q: 'sshd accepted failed password' },
  { label: 'Network Failure', event_type: 'network_dhcp_failure', q: 'dhcp link down network unreachable' },
  { label: 'Disk Error', event_type: 'disk_smart_issue', q: 'smart disk error' },
]

export default function LogsPage() {
  const [searchParams] = useSearchParams()
  const [keyword, setKeyword] = useState(searchParams.get('q') ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [incident, setIncident] = useState<IncidentSummary | null>(null)
  const [investigating, setInvestigating] = useState(false)
  const [deepSyncing, setDeepSyncing] = useState(false)
  const [filters, setFilters] = useState<LogFilters>(() => ({
    limit: 500,
    q: searchParams.get('q') ?? undefined,
    source: searchParams.get('source') ?? undefined,
    severity: searchParams.get('severity') ?? undefined,
    proxmox_host: searchParams.get('proxmox_host') ?? undefined,
    vmid: searchParams.get('vmid') ?? undefined,
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

  const proxmoxHosts = useMemo(() => [...new Set(servers.map(s => s.proxmox_host).filter(Boolean))], [servers])
  const vmids = useMemo(() => [...new Set(servers.map(s => s.vmid).filter(Boolean))], [servers])

  const set = (k: keyof LogFilters, v: string | number | undefined) =>
    setFilters(f => ({ ...f, [k]: v || undefined }))

  function applyShortcut(s: typeof DATE_SHORTCUTS[0]) {
    const r = s.fn()
    setFromDate(r.from)
    setToDate(r.to)
  }

  async function investigate() {
    if (!filters.server_id) return
    setInvestigating(true)
    try {
      const summary = await getIncidentSummary({
        server_id: filters.server_id,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate).toISOString() : undefined,
      })
      setIncident(summary)
    } finally {
      setInvestigating(false)
    }
  }

  async function runDeepSync() {
    if (!filters.server_id) return
    const since = fromDate ? new Date(fromDate).toISOString() : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    setDeepSyncing(true)
    try {
      await deepSync(filters.server_id, since)
    } finally {
      setDeepSyncing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      <div className="px-6 py-4 bg-gray-900 border-b border-gray-700">
        <h1 className="text-base font-semibold text-white">Logs</h1>
        <p className="text-xs text-gray-400 mt-0.5">Review robot, server, host, VM, power, network, and unknown events</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            <select className={inputCls} value={filters.server_id ?? ''} onChange={e => set('server_id', e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All servers</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select className={inputCls} value={filters.proxmox_host ?? ''} onChange={e => set('proxmox_host', e.target.value)}>
              <option value="">All PVE hosts</option>
              {proxmoxHosts.map(host => <option key={host} value={host}>{host}</option>)}
            </select>
            <select className={inputCls} value={filters.vmid ?? ''} onChange={e => set('vmid', e.target.value)}>
              <option value="">All VMIDs</option>
              {vmids.map(vmid => <option key={vmid} value={vmid}>{vmid}</option>)}
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
                setIncident(null)
                setFilters({ limit: 500 })
              }} className="text-xs text-red-400 hover:text-red-300">
                Clear filters
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-gray-400 self-center mr-1">Quick</span>
            {QUICK_FILTERS.map(f => (
              <button key={f.label} onClick={() => {
                setKeyword(f.q)
                set('event_type', f.event_type)
              }} className="text-xs px-2.5 py-1 rounded-md border border-gray-600 text-gray-400 hover:bg-gray-700 hover:text-gray-200">
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-700 pt-3">
            <button onClick={investigate} disabled={!filters.server_id || investigating}
              className="text-xs px-3 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40">
              {investigating ? 'Investigating...' : 'Investigate selected server'}
            </button>
            <button onClick={runDeepSync} disabled={!filters.server_id || deepSyncing}
              className="text-xs px-3 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40">
              {deepSyncing ? 'Deep syncing...' : 'Deep Sync selected server'}
            </button>
            <span className="text-xs text-gray-500">Select a server and time range to correlate Ubuntu, FleetManager, and Proxmox evidence.</span>
          </div>
        </div>

        {incident && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Incident Summary</h2>
                <p className="text-xs text-gray-500 mt-1">{incident.server_name}{incident.vmid ? ` / VM ${incident.vmid}` : ''}{incident.proxmox_host ? ` on ${incident.proxmox_host}` : ''}</p>
              </div>
              <div className="text-xs text-gray-500 text-right">
                <div>Started: {incident.started_at ? new Date(incident.started_at).toLocaleString() : 'Not found'}</div>
                <div>Recovered: {incident.recovered_at ? new Date(incident.recovered_at).toLocaleString() : 'Not found'}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">What happened</p>
                <p className="text-sm text-gray-100">{incident.what_happened}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">Likely root cause</p>
                <p className="text-sm text-gray-100">{incident.root_cause}</p>
              </div>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-400 mb-1">Recommended fix</p>
                <p className="text-sm text-gray-100">{incident.recommended_fix}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-2">Evidence</p>
              <div className="space-y-1.5">
                {incident.evidence.length === 0 && <p className="text-xs text-gray-500">No categorized evidence found in this window.</p>}
                {incident.evidence.map((ev, idx) => (
                  <div key={`${ev.timestamp}-${idx}`} className="grid grid-cols-12 gap-2 text-xs bg-gray-900 border border-gray-700 rounded-md px-3 py-2">
                    <span className="col-span-2 text-gray-500 font-mono">{new Date(ev.timestamp).toLocaleString()}</span>
                    <span className="col-span-2 text-blue-300">{ev.event_type}</span>
                    <span className="col-span-2 text-gray-400">{ev.source}</span>
                    <span className="col-span-6 text-gray-300 truncate">{ev.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

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
