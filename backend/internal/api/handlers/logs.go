package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yashwanta/AMRDashboard/internal/models"
)

type LogHandler struct {
	db *pgxpool.Pool
}

func NewLogHandler(db *pgxpool.Pool) *LogHandler {
	return &LogHandler{db: db}
}

func (h *LogHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit := 200
	if l, err := strconv.Atoi(q.Get("limit")); err == nil && l > 0 && l <= 1000 {
		limit = l
	}
	offset := 0
	if o, err := strconv.Atoi(q.Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	where := "WHERE 1=1"
	args := []any{}
	argN := 1

	if sID := q.Get("server_id"); sID != "" {
		where += " AND le.server_id=$" + strconv.Itoa(argN)
		args = append(args, sID)
		argN++
	}
	if et := q.Get("event_type"); et != "" {
		where += " AND le.event_type=$" + strconv.Itoa(argN)
		args = append(args, et)
		argN++
	}
	if sev := q.Get("severity"); sev != "" {
		where += " AND le.severity=$" + strconv.Itoa(argN)
		args = append(args, sev)
		argN++
	}
	if source := q.Get("source"); source != "" {
		where += " AND le.source=$" + strconv.Itoa(argN)
		args = append(args, source)
		argN++
	}
	if host := q.Get("proxmox_host"); host != "" {
		where += " AND s.proxmox_host=$" + strconv.Itoa(argN)
		args = append(args, host)
		argN++
	}
	if vmid := q.Get("vmid"); vmid != "" {
		where += " AND s.vmid=$" + strconv.Itoa(argN)
		args = append(args, vmid)
		argN++
	}
	if search := q.Get("q"); search != "" {
		where += " AND (le.message ILIKE $" + strconv.Itoa(argN) + " OR le.source ILIKE $" + strconv.Itoa(argN) + " OR s.name ILIKE $" + strconv.Itoa(argN) + ")"
		args = append(args, "%"+search+"%")
		argN++
	}
	if from := q.Get("from"); from != "" {
		where += " AND le.timestamp >= $" + strconv.Itoa(argN)
		args = append(args, from)
		argN++
	}
	if to := q.Get("to"); to != "" {
		where += " AND le.timestamp <= $" + strconv.Itoa(argN)
		args = append(args, to)
		argN++
	}

	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), `
		SELECT le.id, le.server_id, s.name, le.timestamp, le.event_type,
		       le.severity, le.message, le.source, le.created_at
		FROM log_events le
		JOIN servers s ON s.id = le.server_id
		`+where+`
		ORDER BY le.timestamp DESC
		LIMIT $`+strconv.Itoa(argN)+` OFFSET $`+strconv.Itoa(argN+1), args...)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var events []models.LogEvent
	for rows.Next() {
		var e models.LogEvent
		if err := rows.Scan(&e.ID, &e.ServerID, &e.ServerName, &e.Timestamp,
			&e.EventType, &e.Severity, &e.Message, &e.Source, &e.CreatedAt); err != nil {
			continue
		}
		events = append(events, e)
	}
	if events == nil {
		events = []models.LogEvent{}
	}
	jsonOK(w, events)
}

func (h *LogHandler) Stats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats models.DashboardStats

	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM servers`).Scan(&stats.TotalServers)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM servers WHERE status='online'`).Scan(&stats.OnlineServers)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events`).Scan(&stats.TotalEvents)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE severity IN ('critical','high')`).Scan(&stats.CriticalEvents)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='crash'`).Scan(&stats.CrashCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('power_off','ubuntu_server_shutdown','ubuntu_server_reboot','proxmox_host_shutdown','proxmox_host_reboot','vm_stopped','vm_reboot','power_network_event')`).Scan(&stats.PowerOffCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='error'`).Scan(&stats.ErrorCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='robot_offline'`).Scan(&stats.RobotOfflineCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='robot_online'`).Scan(&stats.RobotOnlineCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='disk_error'`).Scan(&stats.DiskErrorCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('ubuntu_server_shutdown','ubuntu_server_reboot','ubuntu_log_gap','service_failure','ssh_login_activity')`).Scan(&stats.UbuntuEventCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('proxmox_host_shutdown','proxmox_host_reboot','ha_action')`).Scan(&stats.ProxmoxEventCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('vm_stopped','vm_started','vm_reboot','vm_killed_by_oom')`).Scan(&stats.VMEventCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('vm_killed_by_oom','host_memory_exhaustion','swap_full')`).Scan(&stats.MemoryEventCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type IN ('backup_job','backup_found_vm_stopped')`).Scan(&stats.BackupEventCount)

	jsonOK(w, stats)
}

func (h *LogHandler) IncidentSummary(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	serverID, err := strconv.Atoi(q.Get("server_id"))
	if err != nil || serverID <= 0 {
		jsonError(w, "server_id is required", http.StatusBadRequest)
		return
	}

	to := time.Now().UTC()
	from := to.Add(-24 * time.Hour)
	if raw := q.Get("from"); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			from = t
		}
	}
	if raw := q.Get("to"); raw != "" {
		if t, err := time.Parse(time.RFC3339, raw); err == nil {
			to = t
		}
	}

	var summary models.IncidentSummary
	summary.ServerID = serverID
	summary.From = from
	summary.To = to
	if err := h.db.QueryRow(r.Context(), `
		SELECT name, COALESCE(proxmox_host,''), COALESCE(vmid,'')
		FROM servers WHERE id=$1`, serverID).Scan(&summary.ServerName, &summary.ProxmoxHost, &summary.VMID); err != nil {
		jsonError(w, "server not found", http.StatusNotFound)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT timestamp, event_type, severity, source, message
		FROM log_events
		WHERE server_id=$1 AND timestamp >= $2 AND timestamp <= $3
		ORDER BY timestamp ASC
		LIMIT 200`, serverID, from, to)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	counts := map[string]int{}
	var first, recovered *time.Time
	var evidence []models.IncidentEvidence
	for rows.Next() {
		var ev models.IncidentEvidence
		if err := rows.Scan(&ev.Timestamp, &ev.EventType, &ev.Severity, &ev.Source, &ev.Message); err != nil {
			continue
		}
		counts[ev.EventType]++
		if ev.EventType != "unknown" && first == nil {
			t := ev.Timestamp
			first = &t
		}
		if ev.EventType == "robot_online" || ev.EventType == "vm_started" {
			t := ev.Timestamp
			recovered = &t
		}
		if len(evidence) < 12 && ev.EventType != "unknown" {
			if len(ev.Message) > 220 {
				ev.Message = ev.Message[:220]
			}
			evidence = append(evidence, ev)
		}
	}
	if evidence == nil {
		evidence = []models.IncidentEvidence{}
	}

	summary.StartedAt = first
	summary.RecoveredAt = recovered
	summary.Evidence = evidence
	summary.WhatHappened, summary.RootCause, summary.RecommendedFix = correlateIncident(counts, summary)
	jsonOK(w, summary)
}

func correlateIncident(counts map[string]int, s models.IncidentSummary) (string, string, string) {
	has := func(types ...string) bool {
		for _, t := range types {
			if counts[t] > 0 {
				return true
			}
		}
		return false
	}
	label := s.ServerName
	if s.VMID != "" {
		label += " VM " + s.VMID
	}

	switch {
	case has("vm_killed_by_oom") && has("host_memory_exhaustion"):
		return label + " stopped during a host memory pressure event.", "VM stopped due to Proxmox host memory exhaustion.", "Reduce host memory pressure, review VM reservations/ballooning, and consider moving workloads before restarting the VM."
	case has("backup_found_vm_stopped") && has("vm_stopped"):
		return label + " was already stopped when a backup job ran.", "VM was stopped before or during backup processing.", "Check Proxmox task history around the stop event, then verify backup scheduling and VM start policy."
	case has("ubuntu_log_gap") && has("proxmox_host_reboot", "proxmox_host_shutdown"):
		return label + " had an Ubuntu log gap during a Proxmox host event.", "Proxmox host shutdown or reboot likely interrupted the VM.", "Review host maintenance/power events and confirm the VM auto-start policy."
	case has("vm_stopped") && has("host_memory_exhaustion", "swap_full"):
		return label + " stopped while memory or swap was exhausted.", "VM outage likely caused by memory exhaustion.", "Free host memory, increase swap/RAM, and inspect high-memory processes."
	case has("robot_offline") && !has("vm_stopped", "ubuntu_server_reboot", "proxmox_host_reboot"):
		return label + " reported robot disconnects without matching host or VM failure.", "Robot connection or network issue.", "Check robot power, cabling/Wi-Fi, and FleetManager robot service connectivity."
	case has("crash", "error", "service_failure"):
		return label + " recorded application or service failures.", "FleetManager/application service failure.", "Restart failed services, inspect app logs, and verify dependencies such as database and storage."
	case has("disk_smart_issue", "disk_error"):
		return label + " recorded storage errors.", "Disk, filesystem, or SMART issue.", "Check disk health immediately, verify backups, and remediate failing storage."
	case has("network_dhcp_failure", "power_network_event"):
		return label + " recorded network or power events.", "Network, DHCP, link, or power interruption.", "Check switch port, DHCP lease history, UPS, and host NIC status."
	case has("ssh_login_activity") && !has("robot_offline", "vm_stopped", "crash"):
		return label + " had login activity but no clear outage signal.", "Administrative access observed; root cause not determined from available logs.", "Confirm whether an operator performed maintenance in this window."
	default:
		var names []string
		for t, c := range counts {
			if c > 0 && t != "unknown" {
				names = append(names, t)
			}
		}
		if len(names) == 0 {
			return "No categorized outage events were found in this window.", "Unknown.", "Expand the time range or run Deep Sync with Proxmox mapping configured."
		}
		return label + " had categorized events: " + strings.Join(names, ", ") + ".", "Unknown from available evidence.", "Review the evidence list and expand Deep Sync around the first event."
	}
}

func (h *LogHandler) Timeline(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT DATE_TRUNC('hour', timestamp) AS hour,
		       event_type,
		       COUNT(*) AS cnt
		FROM log_events
		WHERE timestamp >= NOW() - INTERVAL '7 days'
		GROUP BY 1, 2
		ORDER BY 1`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type point struct {
		Hour      string `json:"hour"`
		EventType string `json:"event_type"`
		Count     int    `json:"count"`
	}
	var pts []point
	for rows.Next() {
		var p point
		rows.Scan(&p.Hour, &p.EventType, &p.Count)
		pts = append(pts, p)
	}
	if pts == nil {
		pts = []point{}
	}
	jsonOK(w, pts)
}

func (h *LogHandler) SyncHistory(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT sj.id, sj.server_id, s.name, sj.started_at, sj.finished_at, sj.status, sj.event_count, sj.error
		FROM sync_jobs sj
		JOIN servers s ON s.id = sj.server_id
		ORDER BY sj.started_at DESC
		LIMIT 50`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var jobs []models.SyncJob
	for rows.Next() {
		var j models.SyncJob
		rows.Scan(&j.ID, &j.ServerID, &j.ServerName, &j.StartedAt,
			&j.FinishedAt, &j.Status, &j.EventCount, &j.Error)
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []models.SyncJob{}
	}
	jsonOK(w, jobs)
}

// ServerStats returns per-server event breakdowns for the dashboard.
func (h *LogHandler) ServerStats(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT
			s.id,
			s.name,
			s.status,
			COALESCE(SUM(CASE WHEN le.event_type='robot_offline' THEN 1 END),0) AS robot_offline,
			COALESCE(SUM(CASE WHEN le.event_type='robot_online'  THEN 1 END),0) AS robot_online,
			COALESCE(SUM(CASE WHEN le.event_type='crash'         THEN 1 END),0) AS crashes,
			COALESCE(SUM(CASE WHEN le.event_type='disk_error'    THEN 1 END),0) AS disk_errors,
			COALESCE(SUM(CASE WHEN le.event_type='error'         THEN 1 END),0) AS errors,
			COALESCE(SUM(CASE WHEN le.event_type='warning'       THEN 1 END),0) AS warnings,
			COALESCE(SUM(CASE WHEN le.severity IN ('critical','high') THEN 1 END),0) AS critical
		FROM servers s
		LEFT JOIN log_events le ON le.server_id = s.id
		GROUP BY s.id, s.name, s.status
		ORDER BY s.name`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ServerStat struct {
		ID           int    `json:"id"`
		Name         string `json:"name"`
		Status       string `json:"status"`
		RobotOffline int    `json:"robot_offline"`
		RobotOnline  int    `json:"robot_online"`
		Crashes      int    `json:"crashes"`
		DiskErrors   int    `json:"disk_errors"`
		Errors       int    `json:"errors"`
		Critical     int    `json:"critical"`
	}

	var results []ServerStat
	for rows.Next() {
		var s ServerStat
		rows.Scan(&s.ID, &s.Name, &s.Status, &s.RobotOffline, &s.RobotOnline,
			&s.Crashes, &s.DiskErrors, &s.Errors, &s.Critical)
		results = append(results, s)
	}
	if results == nil {
		results = []ServerStat{}
	}
	jsonOK(w, results)
}
