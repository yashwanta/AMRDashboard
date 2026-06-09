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

interface ProxmoxAccessLog {
  clientIP: string
  user: string
  time: string
  method: string
  path: string
  node?: string
  resourceType?: string
  resourceId?: string
  action: 'console' | 'api' | 'other'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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

function fullMessage(ev: LogEvent): string {
  return ev.raw_line?.trim() || ev.message
}

function parseProxmoxAccessLog(raw: string): ProxmoxAccessLog | null {
  const log = raw.trim()
  if (!log.includes('pveproxy/access.log') && !log.includes('/api2/')) return null

  const match = log.match(/(?:::ffff:)?([0-9a-fA-F:.]+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^"\s]+)/)
  if (!match) return null

  const path = safeDecodeURIComponent(match[5])
  const route = path.match(/\/api2\/(?:json|extjs|html)\/nodes\/([^/]+)\/(lxc|qemu)\/([^/]+)\/([^?/\s]+)/)
  const action = route?.[4]?.includes('vnc') ? 'console' : path.includes('vnc') ? 'console' : 'api'
  return {
    clientIP: match[1],
    user: match[2],
    time: formatAccessTime(match[3]),
    method: match[4],
    path,
    node: route?.[1],
    resourceType: route?.[2] === 'lxc' ? 'LXC container' : route?.[2] === 'qemu' ? 'VM' : undefined,
    resourceId: route?.[3],
    action,
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function formatAccessTime(raw: string): string {
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/)
  if (!match) return raw
  const day = Number(match[1])
  const month = Number(match[2])
  const year = match[3]
  let hour = Number(match[4])
  const minute = match[5]
  const second = match[6]
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  const monthLabel = MONTHS[month - 1] ?? match[2]
  return `${monthLabel} ${day}, ${year} at ${hour}:${minute}:${second} ${suffix} (${match[7]})`
}

function stripAnsi(s: string): string {
  return s.replace(/#033\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*m/g, '')
}

function cleanMessage(raw: string): string {
  const parsed = parseRawLog(raw)
  return stripAnsi(parsed ? parsed.body : raw.trim())
}

function explainMessage(ev: LogEvent): string {
  const raw = fullMessage(ev)
  const message = raw.toLowerCase()
  const access = parseProxmoxAccessLog(raw)
  if (access?.action === 'console' && access.resourceType && access.resourceId) {
    return `${access.user} opened a Proxmox console session for ${access.resourceType} ${access.resourceId} from ${access.clientIP}.`
  }
  if (access) return `${access.user} made a Proxmox API request from ${access.clientIP}.`
  const rds = parseRdsLog(raw)
  const oom = ev.oom_analysis
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
  if (ev.event_type === 'vm_stopped') return 'A virtual machine was stopped or received a shutdown event.'
  if (ev.event_type === 'vm_started') return 'A virtual machine started or returned to running state.'
  if (ev.event_type === 'vm_reboot') return 'A virtual machine recorded or received a reboot event.'
  if (ev.event_type === 'vm_killed_by_oom' && oom?.killed_vmid) {
    const label = oom.killed_vm_name ? `VM ${oom.killed_vmid} (${oom.killed_vm_name})` : `VM ${oom.killed_vmid}`
    return `${label} was killed by the Proxmox OOM killer.`
  }
  if (ev.event_type === 'vm_killed_by_oom') return 'A VM process appears to have been killed during an out-of-memory condition.'
  if (ev.event_type === 'host_memory_exhaustion') return 'The Proxmox host reported memory exhaustion.'
  if (ev.event_type === 'swap_full') return 'The host reported full or exhausted swap.'
  if (ev.event_type === 'backup_job') return 'A backup job or backup-system event was recorded.'
  if (ev.event_type === 'backup_found_vm_stopped') return 'A backup job found the VM was already stopped or not running.'
  if (ev.event_type === 'ha_action') return 'A Proxmox HA action was recorded.'
  if (ev.event_type === 'disk_smart_issue') return 'Storage or SMART health evidence was recorded.'
  if (ev.event_type === 'network_dhcp_failure') return 'A network, DHCP, link, or reachability failure was recorded.'
  if (ev.event_type === 'ssh_login_activity') return 'SSH, sudo, or login activity was recorded.'
  if (ev.event_type === 'service_failure') return 'A system service failed or entered a failed state.'
  if (ev.event_type === 'ubuntu_log_gap') return 'Ubuntu logs show a gap, rotation, or time discontinuity.'
  if (ev.event_type === 'power_network_event') return 'A power or network signal was recorded.'
  if (ev.event_type === 'unknown') return 'This log line did not match a known category rule.'
  if (message.includes('segfault')) return 'A process stopped after a memory access fault.'
  if (message.includes('out of memory') || message.includes('oom')) return 'The system reported memory pressure or an OOM kill.'
  if (message.includes('i/o error') || message.includes('filesystem error')) return 'The system reported a disk or filesystem problem.'
  return `${eventLabel(ev.event_type)} was recorded.`
}

function suggestAction(ev: LogEvent): string | null {
  const raw = fullMessage(ev)
  const access = parseProxmoxAccessLog(raw)
  if (access?.action === 'console') return 'Reference only: confirm this was expected if you did not open the console, do not recognize the source IP, or root@pam should not have been used.'
  if (access) return 'Reference only: confirm this Proxmox API activity was expected if the user or source IP is unfamiliar.'
  const message = raw.toLowerCase()
  if (ev.event_type === 'robot_offline') {
    if (message.includes('timeout')) return 'Check robot power and network reachability from the server.'
    if (message.includes('remote host closed')) return 'Confirm whether the robot was restarted or intentionally disconnected.'
    return 'Verify robot power, network cabling or Wi-Fi, and the robot service state.'
  }
  if (ev.event_type.includes('shutdown') || ev.event_type.includes('reboot') || ev.event_type === 'vm_stopped') {
    return 'Confirm whether this was planned maintenance. If not, compare nearby power, UPS, and network events.'
  }
  if ((ev.event_type === 'vm_killed_by_oom' || ev.event_type === 'host_memory_exhaustion' || ev.event_type === 'swap_full') && ev.oom_analysis?.recommendation) return ev.oom_analysis.recommendation
  if (ev.event_type === 'vm_killed_by_oom' || ev.event_type === 'host_memory_exhaustion' || ev.event_type === 'swap_full') return 'Review Proxmox host memory pressure, VM reservations, ballooning, and high-memory processes.'
  if (ev.event_type === 'backup_job' || ev.event_type === 'backup_found_vm_stopped') return 'Review Proxmox task history and backup schedule around the VM state change.'
  if (ev.event_type === 'ha_action') return 'Check HA manager decisions, fencing, and migration logs for the affected VM.'
  if (ev.event_type === 'ssh_login_activity') return 'Confirm whether this was expected administrative activity.'
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
  const raw = fullMessage(ev)
  const access = parseProxmoxAccessLog(raw)
  if (access?.action === 'console' && access.resourceType && access.resourceId) {
    return `${access.user} opened console for ${access.resourceType} ${access.resourceId} from ${access.clientIP}`
  }
  if (access) return `${access.user} made Proxmox API request from ${access.clientIP}`
  const rds = parseRdsLog(raw)
  if (ev.event_type === 'robot_offline' && rds?.serverIP) {
    return `${rds.serverIP} ${rds.tcpReason ? `- ${rds.tcpReason}` : '- disconnected'}`
  }
  if (ev.event_type === 'vm_killed_by_oom' && ev.oom_analysis?.killed_vmid) {
    const parts = [`VM ${ev.oom_analysis.killed_vmid}`]
    if (ev.oom_analysis.killed_vm_name) parts.push(ev.oom_analysis.killed_vm_name)
    if (ev.oom_analysis.killed_anon_gb) parts.push(`${ev.oom_analysis.killed_anon_gb.toFixed(2)} GB RSS`)
    return `${parts.join(' - ')} killed by OOM`
  }
  return cleanMessage(raw)
}

function fmtGB(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(2)} GB` : '-'
}

function fmtMB(value?: number): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toLocaleString()} MB` : '-'
}

function vmLabel(vmid?: string, name?: string): string {
  if (!vmid) return '-'
  return name ? `VM ${vmid} (${name})` : `VM ${vmid}`
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
            const isOpen = expanded.has(ev.id)
            const raw = fullMessage(ev)
            const rds = parseRdsLog(raw)
            const parsed = parseRawLog(raw)
            const access = parseProxmoxAccessLog(raw)
            const meta = access
              ? { label: access.action === 'console' ? 'Proxmox console access' : 'Proxmox API access', tone: 'bg-slate-100 text-slate-700 border-slate-200', row: '' }
              : EVENT_META[ev.event_type] ?? { label: eventLabel(ev.event_type), tone: 'bg-gray-100 text-gray-700 border-gray-200', row: '' }
            const action = suggestAction(ev)
            const oom = access ? null : ev.oom_analysis
            const severityLabel = access ? 'reference' : ev.severity
            const severityClass = access ? SEVERITY_CLASS.low : SEVERITY_CLASS[ev.severity] ?? SEVERITY_CLASS.low

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
                  <span className={clsx('text-xs px-2 py-0.5 rounded-md font-medium whitespace-nowrap capitalize', severityClass)}>
                    {severityLabel}
                  </span>
                </td>
                <td className="py-2.5 overflow-hidden">
                  {showRawSummary
                    ? <span className="block truncate text-xs font-mono text-gray-300">{cleanMessage(raw)}</span>
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

                      {access && (
                        <div className="bg-slate-950/70 border border-slate-700 rounded-lg p-4 space-y-3">
                          <div>
                            <p className="text-xs font-bold text-slate-300 uppercase mb-1">Plain English</p>
                            <p className="text-sm text-slate-100">
                              {access.action === 'console' && access.resourceType && access.resourceId
                                ? `Someone using ${access.user} opened the Proxmox console/VNC session for ${access.resourceType} ${access.resourceId} from IP ${access.clientIP} on ${access.time}.`
                                : `Someone using ${access.user} made a Proxmox API request from IP ${access.clientIP} on ${access.time}.`}
                            </p>
                          </div>
                          {access.action === 'console' && (
                            <p className="text-sm text-slate-200">This is normally just someone clicking Console in Proxmox.</p>
                          )}
                          <div>
                            <p className="text-xs font-bold text-amber-300 uppercase mb-1">Concern only if</p>
                            <ul className="text-sm text-amber-100 space-y-1 list-disc list-inside">
                              <li>You did not do it</li>
                              <li>You do not recognize {access.clientIP}</li>
                              <li>{access.user} should not have been used</li>
                            </ul>
                          </div>
                        </div>
                      )}

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

                      {oom && (
                        <div className="bg-red-950/25 border border-red-800 rounded-lg p-4">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-3">
                            <div>
                              <p className="text-xs font-bold text-red-300 uppercase">Memory culprit analysis</p>
                              <p className="text-sm text-red-100 font-semibold">{oom.explanation}</p>
                            </div>
                            <span className="w-fit rounded-md border border-red-700 px-2 py-1 text-xs font-semibold uppercase text-red-200">
                              {oom.confidence} confidence
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="bg-gray-950/60 border border-gray-700 rounded-lg p-3">
                              <div className="text-xs text-gray-500 mb-1">Killed VM</div>
                              <div className="text-sm font-semibold text-white">{vmLabel(oom.killed_vmid, oom.killed_vm_name)}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                PID {oom.killed_pid || '-'}{oom.killed_process ? ` (${oom.killed_process})` : ''}
                              </div>
                            </div>
                            <div className="bg-gray-950/60 border border-gray-700 rounded-lg p-3">
                              <div className="text-xs text-gray-500 mb-1">Highest memory VM</div>
                              <div className="text-sm font-semibold text-white">{vmLabel(oom.top_vmid, oom.top_vm_name)}</div>
                              <div className="text-xs text-gray-400 mt-1">
                                RSS {fmtGB(oom.top_rss_gb)} / Config {fmtMB(oom.top_config_mb)}
                              </div>
                            </div>
                            <div className="bg-gray-950/60 border border-gray-700 rounded-lg p-3">
                              <div className="text-xs text-gray-500 mb-1">OOM evidence</div>
                              <div className="text-sm font-semibold text-white">{fmtGB(oom.killed_anon_gb)} killed RSS</div>
                              <div className="text-xs text-gray-400 mt-1">
                                Host {oom.proxmox_host || '-'} / Total VM {fmtGB(oom.killed_total_gb)}
                              </div>
                            </div>
                          </div>
                          <p className="text-sm text-red-100 mt-3">{oom.recommendation}</p>
                        </div>
                      )}

                      {action && !oom && (
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
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Category</td><td className="px-3 py-2 text-gray-200">{meta.label}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Source</td><td className="px-3 py-2 text-gray-200">{sourceLabel(ev.source)}</td></tr>
                              {parsed?.host && <tr><td className="px-3 py-2 font-medium text-gray-400">Hostname</td><td className="px-3 py-2 font-mono text-gray-200">{parsed.host}</td></tr>}
                              {parsed?.process && <tr><td className="px-3 py-2 font-medium text-gray-400">Process</td><td className="px-3 py-2 font-mono text-gray-200">{parsed.process}</td></tr>}
                              <tr><td className="px-3 py-2 font-medium text-gray-400 align-top">Raw log</td><td className="px-3 py-2 font-mono text-gray-200 break-all whitespace-pre-wrap">{parsed?.body ?? raw}</td></tr>
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
