import axios from 'axios'
import type {
  Server, ServerRequest, LogEvent, DashboardStats,
  TimelinePoint, SyncJob, IncidentSummary, ActionRun, ActionRunRequest, LoginResponse
} from '../types'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(config => {
  const token = localStorage.getItem('robowatch_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('robowatch_token')
      localStorage.removeItem('robowatch_user')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth
export const login = (username: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { username, password }).then(r => r.data)

export const getMe = () => api.get<{ username: string }>('/auth/me').then(r => r.data)

// Servers
export const getServers = () => api.get<Server[]>('/servers').then(r => r.data)
export const createServer = (data: ServerRequest) => api.post<Server>('/servers', data).then(r => r.data)
export const updateServer = (id: number, data: ServerRequest) => api.put<Server>(`/servers/${id}`, data).then(r => r.data)
export const deleteServer = (id: number) => api.delete(`/servers/${id}`)
export const syncServer = (id: number) => api.post<{ job_id: number }>(`/servers/${id}/sync`).then(r => r.data)
export const syncAll = () => api.post('/sync/all').then(r => r.data)
export const testConnection = (data: ServerRequest) =>
  api.post<{ success: boolean; error?: string; info?: string }>('/sync/test', data).then(r => r.data)

// Logs & stats
export interface LogFilters {
  server_id?: number
  event_type?: string
  event_types?: string
  severity?: string
  source?: string
  proxmox_host?: string
  vmid?: string
  q?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export const getLogs = (filters: LogFilters = {}) => {
  const params = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== '')
  )
  return api.get<LogEvent[]>('/logs', { params }).then(r => r.data)
}

export const getStats = () => api.get<DashboardStats>('/stats').then(r => r.data)
export const getTimeline = () => api.get<TimelinePoint[]>('/timeline').then(r => r.data)
export const getSyncHistory = () => api.get<SyncJob[]>('/sync-history').then(r => r.data)

export const getServerStats = () => api.get('/server-stats').then(r => r.data)

export const deepSync = (id: number, since: string) => api.post(`/servers/${id}/deep-sync?since=${encodeURIComponent(since)}`).then(r => r.data)

export interface IncidentSummaryParams {
  server_id: number
  from?: string
  to?: string
}

export const getIncidentSummary = (params: IncidentSummaryParams) =>
  api.get<IncidentSummary>('/incidents/summary', { params }).then(r => r.data)

// Remote actions
export const runAction = (data: ActionRunRequest) =>
  api.post<ActionRun>('/actions/run', data).then(r => r.data)

export const getActionHistory = () =>
  api.get<ActionRun[]>('/actions/history').then(r => r.data)
