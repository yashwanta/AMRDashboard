import type { LogEvent } from './types'

export const EVENT_TYPES = [
  { value: '', label: 'All categories' },
  { value: 'robot_offline', label: 'Robot offline' },
  { value: 'ubuntu_server_shutdown', label: 'Ubuntu server shutdown' },
  { value: 'ubuntu_server_reboot', label: 'Ubuntu server reboot' },
  { value: 'proxmox_host_shutdown', label: 'Proxmox host shutdown' },
  { value: 'proxmox_host_reboot', label: 'Proxmox host reboot' },
  { value: 'vm_shutdown', label: 'VM shutdown' },
  { value: 'vm_reboot', label: 'VM reboot' },
  { value: 'power_network_event', label: 'Power/network event' },
  { value: 'unknown', label: 'Unknown event' },
  { value: 'crash', label: 'Crash' },
  { value: 'disk_error', label: 'Disk error' },
  { value: 'error', label: 'System error' },
  { value: 'warning', label: 'Warning' },
  { value: 'robot_online', label: 'Robot online' },
  { value: 'update', label: 'Update' },
  { value: 'info', label: 'Info' },
] as const

export const SEVERITIES = [
  { value: '', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'info', label: 'Info' },
] as const

export const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'journald', label: 'System journal' },
  { value: 'journald_amr', label: 'AMR/RDS connection log' },
  { value: 'journald_kernel', label: 'Kernel journal' },
  { value: 'journald_warnings', label: 'System warnings' },
  { value: 'journald_robod', label: 'Robod service log' },
  { value: 'syslog', label: 'Syslog' },
  { value: 'kern.log', label: 'Kernel log' },
  { value: 'auth.log', label: 'Auth log' },
  { value: 'roboshop_app', label: 'Roboshop app log' },
  { value: 'rds_file_logs', label: 'RDS file log' },
  { value: 'live_amr_tcp', label: 'Live TCP' },
  { value: 'system_info', label: 'System info' },
] as const

export const EVENT_META: Record<string, { label: string; tone: string; row: string }> = {
  robot_offline: { label: 'Robot offline', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  ubuntu_server_shutdown: { label: 'Ubuntu server shutdown', tone: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-950/20' },
  ubuntu_server_reboot: { label: 'Ubuntu server reboot', tone: 'bg-amber-100 text-amber-700 border-amber-200', row: 'bg-amber-950/20' },
  proxmox_host_shutdown: { label: 'Proxmox host shutdown', tone: 'bg-purple-100 text-purple-700 border-purple-200', row: 'bg-purple-950/20' },
  proxmox_host_reboot: { label: 'Proxmox host reboot', tone: 'bg-violet-100 text-violet-700 border-violet-200', row: 'bg-violet-950/20' },
  vm_shutdown: { label: 'VM shutdown', tone: 'bg-sky-100 text-sky-700 border-sky-200', row: 'bg-sky-950/20' },
  vm_reboot: { label: 'VM reboot', tone: 'bg-blue-100 text-blue-700 border-blue-200', row: 'bg-blue-950/20' },
  power_network_event: { label: 'Power/network event', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200', row: 'bg-yellow-950/20' },
  unknown: { label: 'Unknown event', tone: 'bg-gray-100 text-gray-700 border-gray-200', row: '' },
  crash: { label: 'Crash', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  disk_error: { label: 'Disk error', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200', row: 'bg-yellow-950/20' },
  error: { label: 'System error', tone: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-950/20' },
  warning: { label: 'Warning', tone: 'bg-purple-100 text-purple-700 border-purple-200', row: '' },
  robot_online: { label: 'Robot online', tone: 'bg-green-100 text-green-700 border-green-200', row: 'bg-green-950/10' },
  update: { label: 'Update', tone: 'bg-blue-100 text-blue-700 border-blue-200', row: '' },
  info: { label: 'Info', tone: 'bg-blue-100 text-blue-700 border-blue-200', row: '' },
}

export const SEVERITY_CLASS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border border-red-200',
  high: 'bg-orange-100 text-orange-700 border border-orange-200',
  medium: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  low: 'bg-gray-100 text-gray-600 border border-gray-200',
  info: 'bg-blue-100 text-blue-700 border border-blue-200',
}

export function eventLabel(eventType: LogEvent['event_type'] | string) {
  return EVENT_META[eventType]?.label ?? eventType.replace(/_/g, ' ')
}

export function sourceLabel(source: string) {
  return SOURCE_OPTIONS.find(s => s.value === source)?.label ?? source
}
