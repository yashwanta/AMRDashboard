export interface Server {
  id: number
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'key'
  last_sync_at: string | null
  status: 'online' | 'offline' | 'error' | 'unknown'
  created_at: string
}

export interface ServerRequest {
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'key'
  password?: string
  private_key?: string
}

export interface LogEvent {
  id: number
  server_id: number
  server_name: string
  timestamp: string
  event_type:
    | 'robot_offline'
    | 'ubuntu_server_shutdown'
    | 'ubuntu_server_reboot'
    | 'proxmox_host_shutdown'
    | 'proxmox_host_reboot'
    | 'vm_shutdown'
    | 'vm_reboot'
    | 'power_network_event'
    | 'unknown'
    | 'crash'
    | 'power_off'
    | 'error'
    | 'warning'
    | 'info'
    | 'robot_online'
    | 'disk_error'
    | 'update'
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  message: string
  source: string
  created_at: string
}

export interface DashboardStats {
  total_servers: number
  online_servers: number
  total_events: number
  critical_events: number
  crash_count: number
  power_off_count: number
  error_count: number
  robot_offline_count: number
  robot_online_count: number
  disk_error_count: number
}

export interface TimelinePoint {
  hour: string
  event_type: string
  count: number
}

export interface SyncJob {
  id: number
  server_id: number
  server_name: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'success' | 'failed'
  event_count: number
  error: string
}

export type EventType = LogEvent['event_type']
export type Severity = LogEvent['severity']
