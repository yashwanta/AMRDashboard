export interface Server {
  id: number
  name: string
  host: string
  port: number
  username: string
  auth_type: 'password' | 'key'
  proxmox_host: string
  proxmox_port: number
  proxmox_username: string
  proxmox_auth_type: 'password' | 'key'
  vmid: string
  app_log_paths: string
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
  proxmox_host?: string
  proxmox_port?: number
  proxmox_username?: string
  proxmox_auth_type?: 'password' | 'key'
  proxmox_password?: string
  proxmox_private_key?: string
  vmid?: string
  app_log_paths?: string
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
    | 'vm_stopped'
    | 'vm_started'
    | 'vm_reboot'
    | 'vm_killed_by_oom'
    | 'host_memory_exhaustion'
    | 'swap_full'
    | 'backup_job'
    | 'backup_found_vm_stopped'
    | 'ha_action'
    | 'disk_smart_issue'
    | 'network_dhcp_failure'
    | 'ssh_login_activity'
    | 'service_failure'
    | 'ubuntu_log_gap'
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
  raw_line?: string
  oom_analysis?: OOMAnalysis
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
  ubuntu_event_count: number
  proxmox_event_count: number
  vm_event_count: number
  memory_event_count: number
  backup_event_count: number
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

export interface IncidentEvidence {
  timestamp: string
  event_type: string
  severity: string
  source: string
  message: string
}

export interface IncidentSummary {
  server_id: number
  server_name: string
  proxmox_host: string
  vmid: string
  from: string
  to: string
  what_happened: string
  started_at: string | null
  recovered_at: string | null
  root_cause: string
  recommended_fix: string
  oom_analysis?: OOMAnalysis
  evidence: IncidentEvidence[]
}

export interface OOMAnalysis {
  killed_vmid?: string
  killed_vm_name?: string
  killed_pid?: string
  killed_process?: string
  killed_anon_gb?: number
  killed_total_gb?: number
  top_vmid?: string
  top_vm_name?: string
  top_pid?: string
  top_rss_gb?: number
  top_config_mb?: number
  proxmox_host?: string
  confidence: string
  explanation: string
  recommendation: string
}

export interface LoginResponse {
  token: string
  username: string
  expires_at: string
}

export type AutomationAction =
  | 'service_status'
  | 'service_restart'
  | 'service_start'
  | 'service_stop'
  | 'service_enable'
  | 'service_disable'
  | 'change_password'
  | 'custom_command'

export interface ActionRunRequest {
  server_id: number
  action: AutomationAction
  service_name?: string
  username?: string
  new_password?: string
  command?: string
}

export interface ActionRun {
  id: number
  server_id: number
  action: AutomationAction
  command: string
  status: 'success' | 'failed'
  output: string
  error?: string
  created_at: string
}
