import type { LogEvent } from './types'

export const EVENT_TYPES = [
  { value: '', label: 'All categories' },
  { value: 'robot_offline', label: 'Robot offline / disconnect' },
  { value: 'crash', label: 'Application crash' },
  { value: 'ubuntu_server_reboot', label: 'Ubuntu server reboot' },
  { value: 'ubuntu_server_shutdown', label: 'Ubuntu server shutdown' },
  { value: 'ubuntu_log_gap', label: 'Ubuntu log gap' },
  { value: 'vm_stopped', label: 'VM stopped' },
  { value: 'vm_started', label: 'VM started' },
  { value: 'vm_reboot', label: 'VM reboot' },
  { value: 'vm_killed_by_oom', label: 'VM killed by OOM' },
  { value: 'host_memory_exhaustion', label: 'Host memory exhaustion' },
  { value: 'swap_full', label: 'Swap full' },
  { value: 'proxmox_host_reboot', label: 'Proxmox host reboot' },
  { value: 'proxmox_host_shutdown', label: 'Proxmox host shutdown' },
  { value: 'backup_job', label: 'Backup job' },
  { value: 'backup_found_vm_stopped', label: 'Backup found VM stopped' },
  { value: 'ha_action', label: 'HA action' },
  { value: 'disk_smart_issue', label: 'Disk/SMART issue' },
  { value: 'disk_error', label: 'Disk error' },
  { value: 'network_dhcp_failure', label: 'Network/DHCP failure' },
  { value: 'ssh_login_activity', label: 'SSH/login activity' },
  { value: 'service_failure', label: 'Service failure' },
  { value: 'power_network_event', label: 'Power/network event' },
  { value: 'unknown', label: 'Unknown event' },
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
  { value: 'proxmox_journal', label: 'Proxmox journal' },
  { value: 'proxmox_syslog', label: 'Proxmox syslog' },
  { value: 'proxmox_tasks', label: 'Proxmox task logs' },
  { value: 'proxmox_api_proxy', label: 'Proxmox API/proxy logs' },
  { value: 'proxmox_qemu', label: 'Proxmox QEMU logs' },
  { value: 'proxmox_vm_status', label: 'VM status/config' },
  { value: 'proxmox_host_memory', label: 'Host memory/swap status' },
  { value: 'proxmox_backup', label: 'Backup job logs' },
  { value: 'proxmox_ha', label: 'HA logs' },
  { value: 'proxmox_storage', label: 'Proxmox storage/SMART' },
  { value: 'proxmox_connection', label: 'Proxmox connection' },
] as const

export const EVENT_META: Record<string, { label: string; tone: string; row: string }> = {
  robot_offline: { label: 'Robot offline / disconnect', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  crash: { label: 'Application crash', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  ubuntu_server_shutdown: { label: 'Ubuntu server shutdown', tone: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-950/20' },
  ubuntu_server_reboot: { label: 'Ubuntu server reboot', tone: 'bg-amber-100 text-amber-700 border-amber-200', row: 'bg-amber-950/20' },
  ubuntu_log_gap: { label: 'Ubuntu log gap', tone: 'bg-amber-100 text-amber-700 border-amber-200', row: 'bg-amber-950/20' },
  proxmox_host_shutdown: { label: 'Proxmox host shutdown', tone: 'bg-purple-100 text-purple-700 border-purple-200', row: 'bg-purple-950/20' },
  proxmox_host_reboot: { label: 'Proxmox host reboot', tone: 'bg-violet-100 text-violet-700 border-violet-200', row: 'bg-violet-950/20' },
  vm_stopped: { label: 'VM stopped', tone: 'bg-sky-100 text-sky-700 border-sky-200', row: 'bg-sky-950/20' },
  vm_started: { label: 'VM started', tone: 'bg-green-100 text-green-700 border-green-200', row: 'bg-green-950/10' },
  vm_reboot: { label: 'VM reboot', tone: 'bg-blue-100 text-blue-700 border-blue-200', row: 'bg-blue-950/20' },
  vm_killed_by_oom: { label: 'VM killed by OOM', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  host_memory_exhaustion: { label: 'Host memory exhaustion', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  swap_full: { label: 'Swap full', tone: 'bg-red-100 text-red-700 border-red-200', row: 'bg-red-950/20' },
  backup_job: { label: 'Backup job', tone: 'bg-indigo-100 text-indigo-700 border-indigo-200', row: 'bg-indigo-950/10' },
  backup_found_vm_stopped: { label: 'Backup found VM stopped', tone: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-950/20' },
  ha_action: { label: 'HA action', tone: 'bg-pink-100 text-pink-700 border-pink-200', row: 'bg-pink-950/20' },
  disk_smart_issue: { label: 'Disk/SMART issue', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200', row: 'bg-yellow-950/20' },
  disk_error: { label: 'Disk error', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200', row: 'bg-yellow-950/20' },
  network_dhcp_failure: { label: 'Network/DHCP failure', tone: 'bg-cyan-100 text-cyan-700 border-cyan-200', row: 'bg-cyan-950/20' },
  ssh_login_activity: { label: 'SSH/login activity', tone: 'bg-gray-100 text-gray-700 border-gray-200', row: '' },
  service_failure: { label: 'Service failure', tone: 'bg-orange-100 text-orange-700 border-orange-200', row: 'bg-orange-950/20' },
  power_network_event: { label: 'Power/network event', tone: 'bg-yellow-100 text-yellow-800 border-yellow-200', row: 'bg-yellow-950/20' },
  unknown: { label: 'Unknown event', tone: 'bg-gray-100 text-gray-700 border-gray-200', row: '' },
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
