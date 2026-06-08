package models

import "time"

type Server struct {
	ID                   int        `json:"id"`
	Name                 string     `json:"name"`
	Host                 string     `json:"host"`
	Port                 int        `json:"port"`
	Username             string     `json:"username"`
	AuthType             string     `json:"auth_type"`
	PasswordEnc          string     `json:"-"`
	PrivateKeyEnc        string     `json:"-"`
	ProxmoxHost          string     `json:"proxmox_host"`
	ProxmoxPort          int        `json:"proxmox_port"`
	ProxmoxUsername      string     `json:"proxmox_username"`
	ProxmoxAuthType      string     `json:"proxmox_auth_type"`
	ProxmoxPasswordEnc   string     `json:"-"`
	ProxmoxPrivateKeyEnc string     `json:"-"`
	VMID                 string     `json:"vmid"`
	AppLogPaths          string     `json:"app_log_paths"`
	LastSyncAt           *time.Time `json:"last_sync_at"`
	Status               string     `json:"status"`
	CreatedAt            time.Time  `json:"created_at"`
}

type LogEvent struct {
	ID         int64     `json:"id"`
	ServerID   int       `json:"server_id"`
	ServerName string    `json:"server_name,omitempty"`
	Timestamp  time.Time `json:"timestamp"`
	EventType  string    `json:"event_type"`
	Severity   string    `json:"severity"`
	Message    string    `json:"message"`
	Source     string    `json:"source"`
	RawLine    string    `json:"raw_line,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

type SyncJob struct {
	ID         int        `json:"id"`
	ServerID   int        `json:"server_id"`
	ServerName string     `json:"server_name,omitempty"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at"`
	Status     string     `json:"status"`
	EventCount int        `json:"event_count"`
	Error      string     `json:"error,omitempty"`
}

type DashboardStats struct {
	TotalServers      int `json:"total_servers"`
	OnlineServers     int `json:"online_servers"`
	TotalEvents       int `json:"total_events"`
	CriticalEvents    int `json:"critical_events"`
	CrashCount        int `json:"crash_count"`
	PowerOffCount     int `json:"power_off_count"`
	ErrorCount        int `json:"error_count"`
	RobotOfflineCount int `json:"robot_offline_count"`
	RobotOnlineCount  int `json:"robot_online_count"`
	DiskErrorCount    int `json:"disk_error_count"`
	UbuntuEventCount  int `json:"ubuntu_event_count"`
	ProxmoxEventCount int `json:"proxmox_event_count"`
	VMEventCount      int `json:"vm_event_count"`
	MemoryEventCount  int `json:"memory_event_count"`
	BackupEventCount  int `json:"backup_event_count"`
}

type ServerRequest struct {
	Name              string `json:"name"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Username          string `json:"username"`
	AuthType          string `json:"auth_type"`
	Password          string `json:"password,omitempty"`
	PrivateKey        string `json:"private_key,omitempty"`
	ProxmoxHost       string `json:"proxmox_host,omitempty"`
	ProxmoxPort       int    `json:"proxmox_port,omitempty"`
	ProxmoxUsername   string `json:"proxmox_username,omitempty"`
	ProxmoxAuthType   string `json:"proxmox_auth_type,omitempty"`
	ProxmoxPassword   string `json:"proxmox_password,omitempty"`
	ProxmoxPrivateKey string `json:"proxmox_private_key,omitempty"`
	VMID              string `json:"vmid,omitempty"`
	AppLogPaths       string `json:"app_log_paths,omitempty"`
}

type IncidentEvidence struct {
	Timestamp time.Time `json:"timestamp"`
	EventType string    `json:"event_type"`
	Severity  string    `json:"severity"`
	Source    string    `json:"source"`
	Message   string    `json:"message"`
}

type IncidentSummary struct {
	ServerID       int                `json:"server_id"`
	ServerName     string             `json:"server_name"`
	ProxmoxHost    string             `json:"proxmox_host"`
	VMID           string             `json:"vmid"`
	From           time.Time          `json:"from"`
	To             time.Time          `json:"to"`
	WhatHappened   string             `json:"what_happened"`
	StartedAt      *time.Time         `json:"started_at"`
	RecoveredAt    *time.Time         `json:"recovered_at"`
	RootCause      string             `json:"root_cause"`
	RecommendedFix string             `json:"recommended_fix"`
	Evidence       []IncidentEvidence `json:"evidence"`
}
