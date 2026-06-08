import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import type { LogEvent } from '../../types'
import { EVENT_META, SEVERITY_CLASS, eventLabel, sourceLabel } from '../../eventTaxonomy'

interface Props {
  events: LogEvent[]
  loading?: boolean
}

interface RdsLog {
  port?: string
  level?: string
  event?: string
  serverIP?: string
  serverPort?: string
  tcpReason?: string
  socketState?: string
}

interface ParsedLog {
  ts: string
  host: string
  process: string
  body: string
}

function parseRdsLog(msg: string): RdsLog | null {
  const portM = msg.match(/^\[(\d+)\]/)
  const levelM = msg.match(/^\[\d+\]\[(\w+)\]/)
  const eventM = msg.match(/^\[\d+\]\[\w+\]\[([^\]]+)\]/)
  const serverM = msg.match(/\[Server:([0-9.]+):(\d+)\]/)
  const tcpM = msg.match(/\[Tcp:([^\]]+)\]/)
  const stateM = msg.match(/SocketState:(\S+)/)
  if (!portM && !serverM) return null
  return {
    port: portM?.[1],
    level: levelM?.[1],
    event: eventM?.[1],
    serverIP: serverM?.[1],
    serverPort: serverM?.[2],
    tcpReason: tcpM?.[1],
    socketState: stateM?.[1],
  }
}

function parseRawLog(raw: string): ParsedLog | null {
  const iso = raw.match(/^(\S+T\S+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (iso) return { ts: iso[1], host: iso[2], process: iso[3], body: iso[4].trim() }
  const syslog = raw.match(/^(\w+\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (syslog) return { ts: syslog[1], host: syslog[2], process: syslog[3], body: syslog[4].trim() }
  return null
}

function stripAnsi(s: string): string {
  return s.replace(/#033\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*m/g, '')
}

function cleanMessage(raw: string): string {
  const parsed = parseRawLog(raw)
  return stripAnsi(parsed ? parsed.body : raw.trim())
}

function explainMessage(ev: LogEvent): string {
  const message = ev.message.toLowerCase()
  const rds = parseRdsLog(ev.message)
  if (ev.event_type === 'robot_offline' && rds?.serverIP) {
    if (message.includes('connection refused')) return `Robot ${rds.serverIP} refused the TCP connection.`
    if (message.includes('remote host closed')) return `Robot ${rds.serverIP} closed the connection unexpectedly.`
    if (message.includes('timeout')) return `The server timed out while trying to reach robot ${rds.serverIP}.`
    return `Robot ${rds.serverIP} is not connected to the server.`
  }
  if (ev.event_type === 'ubuntu_server_shutdown') return 'The Ubuntu server recorded a shutdown sequence.'
  if (ev.event_type === 'ubuntu_server_reboot') return 'The Ubuntu server recorded a reboot sequence.'
  if (ev.event_type === 'proxmox_host_shutdown') return 'The Proxmox host recorded a shutdown-related event.'
  if (ev.event_type === 'proxmox_host_reboot') return 'The Proxmox host recorded a reboot-related event.'
  if (ev.event_type === 'vm_shutdown') return 'A virtual machine recorded or received a shutdown event.'
  if (ev.event_type === 'vm_reboot') return 'A virtual machine recorded or received a reboot event.'
  if (ev.event_type === 'power_network_event') return 'A power or network signal was recorded.'
  if (ev.event_type === 'unknown') return 'This log line did not match a known category rule.'
  if (message.includes('segfault')) return 'A process stopped after a memory access fault.'
  if (message.includes('out of memory') || message.includes('oom')) return 'The system reported memory pressure or an OOM kill.'
  if (message.includes('i/o error') || message.includes('filesystem error')) return 'The system reported a disk or filesystem problem.'
  return `${eventLabel(ev.event_type)} was recorded.`
}

function suggestAction(ev: LogEvent): string | null {
  const message = ev.message.toLowerCase()
  if (ev.event_type === 'robot_offline') {
    if (message.includes('timeout')) return 'Check robot power and network reachability from the server.'
    if (message.includes('remote host closed')) return 'Confirm whether the robot was restarted or intentionally disconnected.'
    return 'Verify robot power, network cabling or Wi-Fi, and the robot service state.'
  }
  if (ev.event_type.includes('shutdown') || ev.event_type.includes('reboot')) {
    return 'Confirm whether this was planned maintenance. If not, compare nearby power, UPS, and network events.'
  }
  if (ev.event_type === 'power_network_event') return 'Check UPS, host power, switch port, and link status around this timestamp.'
  if (ev.event_type === 'unknown') return 'Review the raw log and update parser rules if this pattern should become a named category.'
  if (message.includes('out of memory')) return 'Review memory usage and recent service activity on this server.'
  if (message.includes('i/o error') || message.includes('filesystem error')) return 'Check disk health and backups before restarting affected services.'
  return null
}

function safeFormat(ts: string, fmt: string) {
  try {
    const d = parseISO(ts)
    return isValid(d) ? format(d, fmt) : '-'
  } catch {
    return '-'
  }
}

function friendlySummary(ev: LogEvent): string {
  const rds = parseRdsLog(ev.message)
  if (ev.event_type === 'robot_offline' && rds?.serverIP) {
    return `${rds.serverIP} ${rds.tcpReason ? `- ${rds.tcpReason}` : '- disconnected'}`
  }
  return cleanMessage(ev.message)
}

export default function LogsTable({ events, loading }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showRawSummary, setShowRaw] = useState(false)

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading events...</div>
  if (!events.length) return <div className="text-center py-12 text-gray-400 text-sm">No events match the current filters.</div>

  return (
    <div className="overflow-x-auto bg-gray-900 rounded-lg border border-gray-800">
      <table className="w-full text-sm table-fixed text-gray-200">
        <colgroup>
          <col className="w-8" />
          <col className="w-32" />
          <col className="w-40" />
          <col className="w-44" />
          <col className="w-28" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700 bg-gray-900/60">
            <th className="py-3 font-medium" />
            <th className="py-3 pr-4 font-medium">When</th>
            <th className="py-3 pr-4 font-medium">Server</th>
            <th className="py-3 pr-4 font-medium">Category</th>
            <th className="py-3 pr-4 font-medium">Severity</th>
            <th className="py-3 font-medium">
              <div className="flex items-center gap-2">
                <span>Summary</span>
                <button
                  onClick={() => setShowRaw(v => !v)}
                  title={showRawSummary ? 'Show interpreted summary' : 'Show raw log message'}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded-md border border-blue-800 normal-case"
                >
                  {showRawSummary ? <><EyeOff className="w-3 h-3" /> Interpreted</> : <><Eye className="w-3 h-3" /> Raw</>}
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {events.flatMap(ev => {
            const meta = EVENT_META[ev.event_type] ?? { label: eventLabel(ev.event_type), tone: 'bg-gray-100 text-gray-700 border-gray-200', row: '' }
            const isOpen = expanded.has(ev.id)
            const rds = parseRdsLog(ev.message)
            const parsed = parseRawLog(ev.message)
            const action = suggestAction(ev)

            return [
              <tr
                key={`row-${ev.id}`}
                onClick={() => toggle(ev.id)}
                className={clsx('cursor-pointer transition-colors text-gray-200 border-b border-gray-700/40 hover:bg-gray-800', meta.row)}
              >
                <td className="py-2.5 pl-2 pr-1 text-gray-400">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="py-2.5 pr-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                  {safeFormat(ev.timestamp, 'MM/dd h:mm a')}
                </td>
                <td className="py-2.5 pr-4 text-gray-200 font-medium truncate">{ev.server_name}</td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('inline-flex items-center text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap border', meta.tone)}>
                    {meta.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap capitalize', SEVERITY_CLASS[ev.severity] ?? SEVERITY_CLASS.low)}>
                    {ev.severity}
                  </span>
                </td>
                <td className="py-2.5 overflow-hidden">
                  {showRawSummary
                    ? <span className="block truncate text-xs font-mono text-gray-300">{cleanMessage(ev.message)}</span>
                    : <span className="block truncate text-gray-100 font-medium">{friendlySummary(ev)}</span>
                  }
                </td>
              </tr>,

              isOpen ? (
                <tr key={`detail-${ev.id}`} className={clsx('border-b border-gray-700', meta.row)}>
                  <td colSpan={6} className="px-4 pb-4 pt-1">
                    <div className="space-y-3">
                      <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                        <p className="text-sm font-semibold text-white mb-1">{explainMessage(ev)}</p>
                        <p className="text-xs text-gray-500">
                          {sourceLabel(ev.source)} on {ev.server_name} at {safeFormat(ev.timestamp, 'MMM d, yyyy h:mm:ss a')}
                        </p>
                      </div>

                      {rds && rds.serverIP && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {[
                            { label: 'Robot IP', value: rds.serverIP },
                            { label: 'Port', value: rds.serverPort ?? rds.port ?? '-' },
                            { label: 'TCP reason', value: rds.tcpReason ?? '-' },
                            { label: 'Socket state', value: rds.socketState ?? '-' },
                          ].map(field => (
                            <div key={field.label} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
                              <div className="text-xs text-gray-500 mb-1">{field.label}</div>
                              <div className="text-sm font-semibold text-gray-200 font-mono truncate">{field.value}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {action && (
                        <div className="bg-blue-950/30 border border-blue-800 rounded-lg p-3">
                          <p className="text-xs font-bold text-blue-300 uppercase mb-1">Suggested review</p>
                          <p className="text-sm text-blue-100">{action}</p>
                        </div>
                      )}

                      <details className="group">
                        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 font-medium select-none list-none flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                          Technical details
                        </summary>
                        <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-gray-700/50">
                              <tr><td className="px-3 py-2 font-medium text-gray-400 w-32">Time</td><td className="px-3 py-2 font-mono text-gray-200">{safeFormat(ev.timestamp, 'MMM d, yyyy h:mm:ss a')}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Server</td><td className="px-3 py-2 text-gray-200">{ev.server_name}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Category</td><td className="px-3 py-2 text-gray-200">{eventLabel(ev.event_type)}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Source</td><td className="px-3 py-2 text-gray-200">{sourceLabel(ev.source)}</td></tr>
                              {parsed?.host && <tr><td className="px-3 py-2 font-medium text-gray-400">Hostname</td><td className="px-3 py-2 font-mono text-gray-200">{parsed.host}</td></tr>}
                              {parsed?.process && <tr><td className="px-3 py-2 font-medium text-gray-400">Process</td><td className="px-3 py-2 font-mono text-gray-200">{parsed.process}</td></tr>}
                              <tr><td className="px-3 py-2 font-medium text-gray-400 align-top">Raw log</td><td className="px-3 py-2 font-mono text-gray-200 break-all whitespace-pre-wrap">{parsed?.body ?? ev.message}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
