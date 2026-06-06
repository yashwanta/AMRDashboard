import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { clsx } from 'clsx'
import { ChevronRight, ChevronDown, Eye, EyeOff } from 'lucide-react'
import type { LogEvent } from '../../types'

interface Props {
  events: LogEvent[]
  loading?: boolean
}

// ─── Type config ─────────────────────────────────────────────────────────────
const typeConfig: Record<string, { icon: string; label: string; rowBg: string; badgeCls: string }> = {
  crash:         { icon: '💥', label: 'App Crash',        rowBg: 'bg-red-900/20',    badgeCls: 'bg-red-100 text-red-700 border border-red-200' },
  power_off:     { icon: '⚡', label: 'Server Restart',   rowBg: 'bg-orange-900/20', badgeCls: 'bg-orange-100 text-orange-700 border border-orange-200' },
  robot_offline: { icon: '🤖', label: 'Robot Offline',    rowBg: 'bg-red-900/10',    badgeCls: 'bg-red-100 text-red-700 border border-red-200' },
  robot_online:  { icon: '📡', label: 'Robot Online',     rowBg: 'bg-green-900/10',  badgeCls: 'bg-green-100 text-green-700 border border-green-200' },
  disk_error:    { icon: '💾', label: 'Disk Error',        rowBg: 'bg-yellow-900/10', badgeCls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  update:        { icon: '🔄', label: 'Update Available', rowBg: '',                badgeCls: 'bg-blue-50 text-blue-600 border border-blue-200' },
  error:         { icon: '❌', label: 'System Error',      rowBg: 'bg-yellow-50/20', badgeCls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  warning:       { icon: '⚠️', label: 'Warning',           rowBg: '',                badgeCls: 'bg-purple-100 text-purple-700 border border-purple-200' },
  info:          { icon: 'ℹ️', label: 'Info',              rowBg: '',                badgeCls: 'bg-blue-100 text-blue-700 border border-blue-200' },
}

const severityCls: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high:     'bg-orange-100 text-orange-700 border border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  low:      'bg-gray-100 text-gray-600 border border-gray-200',
}
const severityImpact: Record<string, string> = {
  critical: 'Immediate attention required',
  high:     'Action recommended',
  medium:   'Worth monitoring',
  low:      'No action needed',
}
const sourceFriendly: Record<string, string> = {
  'kern.log': 'Hardware / OS Kernel', syslog: 'System Log', 'auth.log': 'Security / Login',
  journald: 'System Journal', journald_amr: 'AMR/RDS Connection Log',
  roboshop_app: 'Roboshop App Log', rds_file_logs: 'RDS File Log',
  journald_kernel: 'Kernel Journal', journald_warnings: 'System Warnings',
  journald_robod: 'Robod Service Log', system_info: 'System Info', live_amr_tcp: 'Live TCP',
}

// ─── RDS / Roboshop log parser ────────────────────────────────────────────────
// Format: [port][level][event] [Local::0][Server:IP:port][Tcp:reason] SocketState:state
interface RdsLog {
  port?: string
  level?: string
  event?: string
  serverIP?: string
  serverPort?: string
  tcpReason?: string
  socketState?: string
}
function parseRdsLog(msg: string): RdsLog | null {
  const portM    = msg.match(/^\[(\d+)\]/)
  const levelM   = msg.match(/^\[\d+\]\[(\w+)\]/)
  const eventM   = msg.match(/^\[\d+\]\[\w+\]\[([^\]]+)\]/)
  const serverM  = msg.match(/\[Server:([0-9.]+):(\d+)\]/)
  const tcpM     = msg.match(/\[Tcp:([^\]]+)\]/)
  const stateM   = msg.match(/SocketState:(\S+)/)
  if (!portM && !serverM) return null
  return {
    port:        portM?.[1],
    level:       levelM?.[1],
    event:       eventM?.[1],
    serverIP:    serverM?.[1],
    serverPort:  serverM?.[2],
    tcpReason:   tcpM?.[1],
    socketState: stateM?.[1],
  }
}

function humanRdsReason(r: RdsLog): string {
  const tcp = (r.tcpReason ?? '').toLowerCase()
  const ip = r.serverIP ? `robot at ${r.serverIP}` : 'robot'
  if (tcp.includes('connection refused'))    return `Connection refused — the ${ip} rejected the connection`
  if (tcp.includes('remote host closed'))   return `The ${ip} closed the connection unexpectedly`
  if (tcp.includes('timeout'))              return `Connection timed out trying to reach the ${ip}`
  if (tcp.includes('none') && r.socketState?.includes('Unconnected'))
                                             return `The ${ip} became unreachable (no active connection)`
  if (tcp.includes('none') && r.socketState?.includes('Closing'))
                                             return `Connection to the ${ip} is closing`
  if (tcp)                                  return `TCP error "${r.tcpReason}" with the ${ip}`
  return `Robot at ${r.serverIP ?? 'unknown'} is offline`
}

function humanRdsAction(r: RdsLog): string {
  const tcp = (r.tcpReason ?? '').toLowerCase()
  if (tcp.includes('connection refused'))  return 'Check if the robot is powered on and its network service is running. Try pinging the robot IP from the server.'
  if (tcp.includes('remote host closed')) return 'The robot disconnected on its own. Check robot status and whether it was manually shut down or restarted.'
  if (tcp.includes('timeout'))            return 'Check network cables or Wi-Fi between the server and the robot. The robot may be out of range or switched off.'
  return 'Verify the robot is powered on and connected to the network. Contact operations if the issue persists.'
}

// ─── Generic log parser ───────────────────────────────────────────────────────
interface ParsedLog { ts: string; host: string; process: string; body: string }
function parseRawLog(raw: string): ParsedLog | null {
  const iso = raw.match(/^(\S+T\S+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (iso) return { ts: iso[1], host: iso[2], process: iso[3], body: iso[4].trim() }
  const syslog = raw.match(/^(\w+\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (syslog) return { ts: syslog[1], host: syslog[2], process: syslog[3], body: syslog[4].trim() }
  return null
}
function stripAnsi(s: string): string {
  return s.replace(/#033\[[0-9;]*m/g, '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\033\[[0-9;]*m/g, '')
}
function cleanMessage(raw: string): string {
  const p = parseRawLog(raw); return stripAnsi(p ? p.body : raw.trim())
}

// Parse "last reboot" output lines
// Format: "reboot   system boot  6.8.0-110-generic  Wed Apr 29 10:49 - 15:16 (20+04:27)"
interface LastReboot { kernel: string; date: string; duration: string; stillRunning: boolean }
function parseLastReboot(msg: string): LastReboot | null {
  const m = msg.match(/reboot\s+system boot\s+(\S+)\s+\w+\s+(\w+\s+\d+\s+[\d:]+)\s*-\s*([\d:]+)\s+\(([^)]+)\)/)
  if (m) return { kernel: m[1], date: m[2], duration: m[4], stillRunning: false }
  const sr = msg.match(/reboot\s+system boot\s+(\S+)\s+\w+\s+(\w+\s+\d+\s+[\d:]+)\s+still running/)
  if (sr) return { kernel: sr[1], date: sr[2], duration: '', stillRunning: true }
  return null
}
function friendlyDuration(d: string): string {
  // "3+04:22" means 3 days 4h 22m, "08:01" means 8h 1m
  const withDays = d.match(/^(\d+)\+(\d+):(\d+)$/)
  if (withDays) return `${withDays[1]} day${withDays[1]==='1'?'':'s'} ${withDays[2]}h ${withDays[3]}m`
  const hm = d.match(/^(\d+):(\d+)$/)
  if (hm) return `${hm[1]}h ${hm[2]}m`
  return d
}
function explainLastReboot(rb: LastReboot, isCurrentBoot: boolean): string {
  if (rb.stillRunning || isCurrentBoot)
    return `Server has been running since ${rb.date} (current boot, kernel ${rb.kernel}). \u26a0\ufe0f The date shown above is when the dashboard collected this info — the actual boot was on ${rb.date}.`
  return `Historical boot record: server ran kernel ${rb.kernel} starting ${rb.date} for ${friendlyDuration(rb.duration)}, then rebooted. \u26a0\ufe0f The date shown is when the dashboard collected this info, not when it happened.`
}

function explainMessage(eventType: string, message: string): string {
  const m = message.toLowerCase()
  const rds = parseRdsLog(message)
  if (eventType === 'robot_offline' && rds) return humanRdsReason(rds)
  if (eventType === 'robot_online')     return `Robot at ${parseRdsLog(message)?.serverIP ?? 'unknown IP'} connected successfully`
  // last reboot history line
  const rb = parseLastReboot(message)
  if (rb) return explainLastReboot(rb, rb.stillRunning)
  if (m.includes('segfault'))           return 'A program ran into a memory error and was forcefully stopped by the OS.'
  if (m.includes('out of memory') || m.includes('oom')) return 'The server ran out of memory and had to terminate a running program.'
  if (m.includes('kernel panic'))       return 'The operating system itself crashed. The server likely restarted automatically.'
  if (m.includes('i/o error'))          return 'A disk read/write error occurred. The server may have trouble accessing stored data.'
  if (m.includes('ext4-fs error') || m.includes('filesystem error')) return 'The file system reported an error. Data integrity may be at risk.'
  if (m.includes('failed to start'))    return 'A background service or application failed to start correctly.'
  if (m.includes('failed to make thread') || m.includes('realtime scheduled')) return 'A display component could not get the scheduling priority it requested. Usually harmless.'
  if (m.includes('power down') || m.includes('system is going down')) return 'The server was shut down intentionally.'
  if (m.includes('reboot') || m.includes('rebooting')) return 'The server was restarted.'
  if (eventType === 'crash')   return 'A program or system component stopped unexpectedly.'
  if (eventType === 'error')   return 'An error was recorded in the system logs.'
  if (eventType === 'warning') return 'A warning was recorded — worth monitoring but no immediate action needed.'
  return 'A system event was recorded in the logs.'
}

function suggestAction(eventType: string, severity: string, message: string): string | null {
  const m = message.toLowerCase()
  const rds = parseRdsLog(message)
  if (eventType === 'robot_offline' && rds) return humanRdsAction(rds)
  if (eventType === 'robot_online') return null
  if (m.includes('failed to make thread') || m.includes('realtime scheduled')) return null
  if (m.includes('out of memory')) return 'Monitor memory usage. Consider restarting memory-heavy services or requesting more RAM.'
  if (m.includes('kernel panic'))  return 'Verify the server came back online. If panics keep happening, escalate to your IT team.'
  if (m.includes('i/o error') || m.includes('filesystem error')) return 'Check disk health immediately and back up important data. Have an administrator inspect the drive.'
  if (m.includes('failed to start')) return 'Verify the service is running. Restart it if needed, or contact your administrator if it keeps failing.'
  if (eventType === 'crash' && (severity === 'critical' || severity === 'high')) return 'Verify the server and its services are still running. Investigate if this keeps happening.'
  return null
}

function safeFormat(ts: string, fmt: string) {
  try { const d = parseISO(ts); return isValid(d) ? format(d, fmt) : '—' } catch { return '—' }
}

// ─── Friendly one-line summary ────────────────────────────────────────────────
function friendlySummary(ev: LogEvent): string {
  const rds = parseRdsLog(ev.message)
  if (ev.event_type === 'robot_offline' && rds) return humanRdsReason(rds)
  if (ev.event_type === 'robot_online' && rds)  return `Robot at ${rds.serverIP} connected`
  const rb = parseLastReboot(ev.message)
  if (rb && rb.stillRunning) return `Running since ${rb.date} (current boot)`
  if (rb) return `Boot record: started ${rb.date}, ran ${friendlyDuration(rb.duration)} ⚠️ collected ${new Date(ev.timestamp).toLocaleDateString()}`
  return cleanMessage(ev.message)
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LogsTable({ events, loading }: Props) {
  const [expanded, setExpanded]         = useState<Set<number>>(new Set())
  const [showRawSummary, setShowRaw]    = useState(false)

  function toggle(id: number) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Loading events…</div>
  if (!events.length) return <div className="text-center py-12 text-gray-400 text-sm">No events match the current filters.</div>

  return (
    <div className="overflow-x-auto bg-gray-900 rounded-xl">
      <table className="w-full text-sm table-fixed text-gray-200">
        <colgroup>
          <col className="w-6" />
          <col className="w-28" />
          <col className="w-40" />
          <col className="w-36" />
          <col className="w-24" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-700 bg-gray-900/60">
            <th className="pb-3 font-medium" />
            <th className="pb-3 pr-4 font-medium">When</th>
            <th className="pb-3 pr-4 font-medium">Server</th>
            <th className="pb-3 pr-4 font-medium">What Happened</th>
            <th className="pb-3 pr-4 font-medium">Severity</th>
            <th className="pb-3 font-medium">
              <div className="flex items-center gap-2">
                <span>Summary</span>
                <button
                  onClick={() => setShowRaw(v => !v)}
                  title={showRawSummary ? 'Show plain-English summary' : 'Show raw log message'}
                  className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full transition-colors font-normal normal-case tracking-normal"
                >
                  {showRawSummary ? <><EyeOff className="w-3 h-3" /> Hide raw</> : <><Eye className="w-3 h-3" /> Show raw</>}
                </button>
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {events.flatMap(ev => {
            const cfg    = typeConfig[ev.event_type] ?? { icon: '•', label: ev.event_type, rowBg: '', badgeCls: 'bg-gray-100 text-gray-600 border border-gray-200' }
            const isOpen = expanded.has(ev.id)
            const rds    = parseRdsLog(ev.message)
            const parsed = parseRawLog(ev.message)

            return [
              <tr
                key={`row-${ev.id}`}
                onClick={() => toggle(ev.id)}
                className={clsx('cursor-pointer transition-colors text-gray-200', cfg.rowBg, !isOpen && 'border-b border-gray-700/40 hover:bg-gray-700/40')}
              >
                <td className="py-2.5 pl-1 pr-1 text-gray-400">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="py-2.5 pr-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                  {safeFormat(ev.timestamp, 'MM/dd h:mm a')}
                </td>
                <td className="py-2.5 pr-4 text-gray-200 font-medium truncate">{ev.server_name}</td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', cfg.badgeCls)}>
                    {cfg.icon} {cfg.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', severityCls[ev.severity] ?? severityCls.low)}>
                    {ev.severity}
                  </span>
                </td>
                <td className="py-2.5 overflow-hidden">
                  {showRawSummary
                    ? <span className="block truncate text-xs font-mono text-gray-300">{cleanMessage(ev.message)}</span>
                    : <span className="block truncate text-gray-700">{friendlySummary(ev)}</span>
                  }
                </td>
              </tr>,

              isOpen ? (
                <tr key={`detail-${ev.id}`} className={clsx('border-b border-gray-100', cfg.rowBg)}>
                  <td colSpan={6} className="px-4 pb-4 pt-1">
                    <div className="space-y-3">

                      {/* Plain-English explanation */}
                      <div className="flex gap-3 bg-gray-900 border border-gray-700 rounded-xl p-4">
                        <span className="text-2xl leading-none mt-0.5 shrink-0">{cfg.icon}</span>
                        <div>
                          <p className="text-sm font-semibold text-white mb-1">{explainMessage(ev.event_type, ev.message)}</p>
                          <p className="text-xs text-gray-500">
                            Severity: <span className="font-semibold capitalize">{ev.severity}</span> — {severityImpact[ev.severity]}
                          </p>
                        </div>
                      </div>

                      {/* Robot-specific details */}
                      {rds && rds.serverIP && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">Robot IP</div>
                            <div className="text-sm font-bold text-gray-800 font-mono">{rds.serverIP}</div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">Port</div>
                            <div className="text-sm font-bold text-gray-800 font-mono">{rds.serverPort ?? rds.port}</div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">TCP Reason</div>
                            <div className="text-sm font-bold text-red-400">{rds.tcpReason ?? '—'}</div>
                          </div>
                          <div className="bg-white border border-gray-200 rounded-lg p-3 text-center">
                            <div className="text-xs text-gray-400 mb-1">State</div>
                            <div className="text-sm font-bold text-orange-400">{rds.socketState ?? '—'}</div>
                          </div>
                        </div>
                      )}

                      {/* What to do */}
                      {suggestAction(ev.event_type, ev.severity, ev.message) && (
                        <div className="flex gap-3 bg-blue-900/20 border border-blue-700 rounded-xl p-3">
                          <span className="text-base shrink-0">💡</span>
                          <div>
                            <p className="text-xs font-bold text-blue-300 uppercase tracking-wide mb-1">What to do</p>
                            <p className="text-sm text-blue-100">{suggestAction(ev.event_type, ev.severity, ev.message)}</p>
                          </div>
                        </div>
                      )}

                      {/* Technical details */}
                      <details className="group">
                        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200 font-medium select-none list-none flex items-center gap-1">
                          <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                          Technical details
                        </summary>
                        <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <tbody className="divide-y divide-gray-700/50">
                              <tr><td className="px-3 py-2 font-medium text-gray-400 w-28">Time</td><td className="px-3 py-2 font-mono text-gray-700">{safeFormat(ev.timestamp, 'MMM d, yyyy h:mm:ss a')}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Server</td><td className="px-3 py-2 text-gray-700">{ev.server_name}</td></tr>
                              {parsed?.host    && <tr><td className="px-3 py-2 font-medium text-gray-400">Hostname</td><td className="px-3 py-2 font-mono text-gray-700">{parsed.host}</td></tr>}
                              {parsed?.process && <tr><td className="px-3 py-2 font-medium text-gray-400">Process</td><td className="px-3 py-2 font-mono text-gray-700">{parsed.process}</td></tr>}
                              <tr><td className="px-3 py-2 font-medium text-gray-400">Source</td><td className="px-3 py-2 text-gray-700">{sourceFriendly[ev.source] ?? ev.source}</td></tr>
                              <tr><td className="px-3 py-2 font-medium text-gray-400 align-top">Raw log</td><td className="px-3 py-2 font-mono text-gray-400 break-all whitespace-pre-wrap text-xs">{parsed?.body ?? ev.message}</td></tr>
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
