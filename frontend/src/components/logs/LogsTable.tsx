import { useState } from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { clsx } from 'clsx'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { LogEvent } from '../../types'

interface Props {
  events: LogEvent[]
  loading?: boolean
}

const typeConfig: Record<string, { icon: string; label: string; rowBg: string; badgeCls: string }> = {
  crash:     { icon: '💥', label: 'App Crash',   rowBg: 'bg-red-50/40',    badgeCls: 'bg-red-100 text-red-700 border border-red-200' },
  power_off: { icon: '⚡', label: 'Restart',      rowBg: 'bg-orange-50/40', badgeCls: 'bg-orange-100 text-orange-700 border border-orange-200' },
  error:     { icon: '❌', label: 'System Error', rowBg: 'bg-yellow-50/30', badgeCls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  warning:   { icon: '⚠️', label: 'Warning',      rowBg: '',                badgeCls: 'bg-purple-100 text-purple-700 border border-purple-200' },
  info:      { icon: 'ℹ️', label: 'Info',         rowBg: '',                badgeCls: 'bg-blue-100 text-blue-700 border border-blue-200' },
}

const severityCls: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high:     'bg-orange-100 text-orange-700 border border-orange-200',
  medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
  low:      'bg-gray-100 text-gray-600 border border-gray-200',
}

const severityImpact: Record<string, string> = {
  critical: 'Needs immediate attention',
  high:     'Action recommended',
  medium:   'Worth monitoring',
  low:      'No action needed',
}

const sourceFriendly: Record<string, string> = {
  'kern.log':          'Hardware / OS Kernel',
  'syslog':            'System Log',
  'auth.log':          'Security / Login Log',
  '/var/log/messages': 'System Messages',
  'journald':          'System Journal',
}

function safeFormat(ts: string, fmt: string, fallback = '—'): string {
  try {
    const d = parseISO(ts)
    return isValid(d) ? format(d, fmt) : fallback
  } catch { return fallback }
}

interface ParsedLog { ts: string; host: string; process: string; body: string }

function parseRawLog(raw: string): ParsedLog | null {
  // "2026-06-05T12:16:53.968606-05:00 HOSTNAME process[pid]: message body"
  const iso = raw.match(/^(\S+T\S+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (iso) return { ts: iso[1], host: iso[2], process: iso[3], body: iso[4].trim() }
  // "Jun  5 12:16:53 HOSTNAME process[pid]: message body"
  const syslog = raw.match(/^(\w+\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+):\s+(.+)$/s)
  if (syslog) return { ts: syslog[1], host: syslog[2], process: syslog[3], body: syslog[4].trim() }
  return null
}

function cleanMessage(raw: string): string {
  const p = parseRawLog(raw)
  if (p) return p.body
  return raw.trim()
}

function explainMessage(eventType: string, message: string): string {
  const m = message.toLowerCase()
  if (m.includes('segfault') || m.includes('segmentation fault'))
    return 'A program ran into a memory error and was forcefully stopped by the operating system.'
  if (m.includes('out of memory') || m.includes('oom_kill') || m.includes('oom killer'))
    return 'The server ran out of memory and had to terminate a running program to free up space.'
  if (m.includes('kernel panic'))
    return 'The operating system itself crashed. The server likely restarted automatically.'
  if (m.includes('call trace') || m.includes('call_trace'))
    return 'A program crashed and left a diagnostic trace in the system log.'
  if (m.includes('edac') || m.includes('corrected memory error') || m.includes('uncorrected memory error'))
    return 'A hardware memory error was detected on this server — this may indicate failing RAM.'
  if (m.includes('machine check') || (m.includes('mce') && eventType === 'error'))
    return 'The processor detected a hardware-level problem. This can indicate overheating or failing components.'
  if (m.includes('buffer i/o error') || m.includes('i/o error'))
    return 'A disk read or write error occurred. The server may have trouble accessing stored data.'
  if (m.includes('ext4-fs error') || m.includes('filesystem error') || m.includes('xfs ('))
    return 'The file system reported an error. Data integrity may be at risk — back up data soon.'
  if (m.includes('failed to start') || m.includes('service entered failed state'))
    return 'A background service or application failed to start correctly.'
  if (m.includes('failed with result'))
    return 'A system service stopped unexpectedly with an error code.'
  if (m.includes('watchdog') || m.includes('soft lockup'))
    return 'The processor appeared stuck or unresponsive — a possible sign of system overload.'
  if (m.includes('netdev watchdog') || m.includes('transmit timeout'))
    return 'A network interface stopped responding. The server may have had a brief network outage.'
  if (m.includes('normal shutdown') || m.includes('normal disconnect'))
    return 'A network connection was closed normally — this is expected behavior, not a problem.'
  if (m.includes('received disconnect'))
    return 'A remote connection ended. This is usually normal after a session or task finishes.'
  if (m.includes('power down') || m.includes('system is going down') || m.includes('shutdown'))
    return 'The server was shut down intentionally.'
  if (m.includes('reboot') || m.includes('rebooting'))
    return 'The server was restarted.'
  if (m.includes('failed to make thread') || m.includes('realtime scheduled'))
    return 'A display component could not get the scheduling priority it requested. This is usually harmless.'
  if (eventType === 'crash')     return 'A program or system component stopped unexpectedly.'
  if (eventType === 'error')     return 'An error was recorded in the system logs.'
  if (eventType === 'warning')   return 'A warning was recorded. No immediate action required, but worth monitoring.'
  if (eventType === 'power_off') return 'The server was shut down or restarted.'
  return 'A system event was recorded in the logs.'
}

function suggestAction(eventType: string, severity: string, message: string): string | null {
  const m = message.toLowerCase()
  if (m.includes('normal shutdown') || m.includes('normal disconnect') || m.includes('received disconnect')) return null
  if (m.includes('failed to make thread') || m.includes('realtime scheduled')) return null
  if (m.includes('segfault') || m.includes('segmentation fault'))
    return 'Check if the affected application is still running. If crashes are recurring, contact your system administrator.'
  if (m.includes('out of memory') || m.includes('oom'))
    return 'Monitor memory usage on this server. Consider restarting memory-heavy services or requesting more RAM.'
  if (m.includes('kernel panic'))
    return 'Verify the server came back online. If panics keep happening, escalate to your IT or hardware team.'
  if (m.includes('edac') || m.includes('machine check') || (m.includes('mce') && eventType === 'error'))
    return 'Contact your hardware team — this may indicate failing memory or CPU components that need replacing.'
  if (m.includes('i/o error') || m.includes('filesystem error'))
    return 'Check disk health immediately and back up important data. Have an administrator inspect the drive.'
  if (m.includes('failed to start') || m.includes('service entered failed'))
    return 'Verify the service is running. Restart it if needed, or contact your administrator if it keeps failing.'
  if (eventType === 'crash' && (severity === 'critical' || severity === 'high'))
    return 'Verify the server and its services are still running. Investigate if this keeps happening.'
  return null
}

export default function LogsTable({ events, loading }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Loading events…</div>
  if (events.length === 0) return <div className="text-center py-12 text-gray-400">No events match the current filters.</div>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-6" />
          <col className="w-28" />
          <col className="w-40" />
          <col className="w-36" />
          <col className="w-24" />
          <col />
        </colgroup>
        <thead>
          <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-100">
            <th className="pb-3 font-medium" />
            <th className="pb-3 pr-4 font-medium">When</th>
            <th className="pb-3 pr-4 font-medium">Server</th>
            <th className="pb-3 pr-4 font-medium">What Happened</th>
            <th className="pb-3 pr-4 font-medium">Severity</th>
            <th className="pb-3 font-medium">Summary</th>
          </tr>
        </thead>
        <tbody>
          {events.flatMap(ev => {
            const cfg = typeConfig[ev.event_type] ?? { icon: '•', label: ev.event_type, rowBg: '', badgeCls: 'bg-gray-100 text-gray-600 border border-gray-200' }
            const isOpen = expanded.has(ev.id)
            const cleaned = cleanMessage(ev.message)
            const parsed = parseRawLog(ev.message)
            const explanation = explainMessage(ev.event_type, ev.message)
            const action = suggestAction(ev.event_type, ev.severity, ev.message)

            return [
              <tr
                key={`row-${ev.id}`}
                onClick={() => toggle(ev.id)}
                className={clsx(
                  'cursor-pointer transition-colors',
                  cfg.rowBg,
                  isOpen ? '' : 'border-b border-gray-50 hover:bg-gray-50/60'
                )}
              >
                <td className="py-2.5 pl-1 pr-1 text-gray-400">
                  {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                </td>
                <td className="py-2.5 pr-4 text-gray-500 whitespace-nowrap font-mono text-xs">
                  {safeFormat(ev.timestamp, 'MM/dd h:mm a')}
                </td>
                <td className="py-2.5 pr-4 text-gray-700 font-medium truncate">{ev.server_name}</td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', cfg.badgeCls)}>
                    <span>{cfg.icon}</span>{cfg.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap', severityCls[ev.severity] ?? severityCls.low)}>
                    {ev.severity}
                  </span>
                </td>
                <td className="py-2.5 text-gray-700 overflow-hidden">
                  <span className="block truncate">{cleaned}</span>
                </td>
              </tr>,

              isOpen ? (
                <tr key={`detail-${ev.id}`} className={clsx('border-b border-gray-100', cfg.rowBg)}>
                  <td colSpan={6} className="px-4 pb-4 pt-1">
                    <div className="space-y-3">

                      {/* Plain-English explanation */}
                      <div className="flex gap-3 bg-white border border-gray-200 rounded-lg p-3">
                        <span className="text-xl leading-none mt-0.5 shrink-0">{cfg.icon}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{explanation}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Severity: <span className="font-semibold capitalize">{ev.severity}</span> — {severityImpact[ev.severity]}
                          </p>
                        </div>
                      </div>

                      {/* What to do */}
                      {action && (
                        <div className="flex gap-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <span className="text-base leading-none mt-0.5 shrink-0">💡</span>
                          <div>
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">What to do</p>
                            <p className="text-sm text-blue-900">{action}</p>
                          </div>
                        </div>
                      )}

                      {/* Structured log fields */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <tbody className="divide-y divide-gray-100">
                            <tr>
                              <td className="px-3 py-2 font-medium text-gray-500 w-28 whitespace-nowrap">Time</td>
                              <td className="px-3 py-2 text-gray-800 font-mono">
                                {safeFormat(ev.timestamp, 'MMM d, yyyy h:mm:ss a')}
                              </td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Server</td>
                              <td className="px-3 py-2 text-gray-800">{ev.server_name}</td>
                            </tr>
                            {parsed?.host && (
                              <tr>
                                <td className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Hostname</td>
                                <td className="px-3 py-2 text-gray-800 font-mono">{parsed.host}</td>
                              </tr>
                            )}
                            {parsed?.process && (
                              <tr>
                                <td className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Process</td>
                                <td className="px-3 py-2 text-gray-800 font-mono">{parsed.process}</td>
                              </tr>
                            )}
                            <tr>
                              <td className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap">Source</td>
                              <td className="px-3 py-2 text-gray-800">{sourceFriendly[ev.source] ?? ev.source}</td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 font-medium text-gray-500 whitespace-nowrap align-top">Message</td>
                              <td className="px-3 py-2 text-gray-800 break-words whitespace-pre-wrap">
                                {parsed?.body ?? cleaned}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

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
