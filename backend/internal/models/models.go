package models

import "time"

type Server struct {
	ID           int       `json:"id"`
	Name         string    `json:"name"`
	Host         string    `json:"host"`
	Port         int       `json:"port"`
	Username     string    `json:"username"`
	AuthType     string    `json:"auth_type"` // "password" | "key"
	PasswordEnc  string    `json:"-"`
	PrivateKeyEnc string   `json:"-"`
	LastSyncAt   *time.Time `json:"last_sync_at"`
	Status       string    `json:"status"` // "online" | "offline" | "error" | "unknown"
	CreatedAt    time.Time `json:"created_at"`
}

type LogEvent struct {
	ID         int64     `json:"id"`
	ServerID   int       `json:"server_id"`
	ServerName string    `json:"server_name,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
	EventType  string    `json:"event_type"` // "crash" | "power_off" | "error" | "warning" | "info"
	Severity   string    `json:"severity"`   // "critical" | "high" | "medium" | "low"
	Message    string    `json:"message"`
	Source     string    `json:"source"` // e.g. "syslog", "journald", "kern.log"
	RawLine    string    `json:"raw_line,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type SyncJob struct {
	ID         int       `json:"id"`
	ServerID   int       `json:"server_id"`
	ServerName string    `json:"server_name,omitempty"`
	StartedAt  time.Time `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Status     string    `json:"status"` // "running" | "success" | "failed"
	EventCount int       `json:"event_count"`
	Error      string    `json:"error,omitempty"`
}

type DashboardStats struct {
	TotalServers    int `json:"total_servers"`
	OnlineServers   int `json:"online_servers"`
	TotalEvents     int `json:"total_events"`
	CriticalEvents  int `json:"critical_events"`
	CrashCount      int `json:"crash_count"`
	PowerOffCount   int `json:"power_off_count"`
	ErrorCount      int `json:"error_count"`
}

type ServerRequest struct {
	Name       string `json:"name"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	AuthType   string `json:"auth_type"`
	Password   string `json:"password,omitempty"`
	PrivateKey string `json:"private_key,omitempty"`
}
