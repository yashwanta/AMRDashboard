package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yashwanta/AMRDashboard/internal/models"
	"github.com/yashwanta/AMRDashboard/internal/parser"
	sshclient "github.com/yashwanta/AMRDashboard/internal/ssh"
)

type SyncHandler struct {
	db            *pgxpool.Pool
	encryptionKey string
}

type syncServerRow struct {
	host               string
	port               int
	username           string
	authType           string
	passwordEnc        string
	keyEnc             string
	proxmoxHost        string
	proxmoxPort        int
	proxmoxUsername    string
	proxmoxAuthType    string
	proxmoxPasswordEnc string
	proxmoxKeyEnc      string
	vmid               string
	appLogPaths        string
	lastSync           *time.Time
}

func NewSyncHandler(db *pgxpool.Pool, key string) *SyncHandler {
	return &SyncHandler{db: db, encryptionKey: key}
}

// SyncServer triggers an on-demand sync for a specific server.
func (h *SyncHandler) SyncServer(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	jobID, err := h.runSync(context.Background(), id)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]int{"job_id": jobID})
}

// SyncAll triggers sync for every server.
func (h *SyncHandler) SyncAll(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `SELECT id FROM servers`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	var ids []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()

	var jobIDs []int
	for _, id := range ids {
		jid, err := h.runSync(context.Background(), id)
		if err != nil {
			log.Printf("sync server %d: %v", id, err)
			continue
		}
		jobIDs = append(jobIDs, jid)
	}
	jsonOK(w, map[string][]int{"job_ids": jobIDs})
}

// RunScheduled is called by the scheduler — not exposed via HTTP.
func (h *SyncHandler) RunScheduled() {
	rows, err := h.db.Query(context.Background(), `SELECT id FROM servers`)
	if err != nil {
		log.Printf("scheduler: list servers: %v", err)
		return
	}
	var ids []int
	for rows.Next() {
		var id int
		rows.Scan(&id)
		ids = append(ids, id)
	}
	rows.Close()

	for _, id := range ids {
		if _, err := h.runSync(context.Background(), id); err != nil {
			log.Printf("scheduler: sync server %d: %v", id, err)
		}
	}
}

func (h *SyncHandler) runSync(ctx context.Context, serverID int) (int, error) {
	s, err := h.loadSyncServer(ctx, serverID, true)
	if err != nil {
		return 0, fmt.Errorf("load server: %w", err)
	}

	// Create sync job record
	var jobID int
	h.db.QueryRow(ctx, `INSERT INTO sync_jobs (server_id) VALUES ($1) RETURNING id`, serverID).Scan(&jobID)

	since := time.Now().Add(-12 * time.Hour)
	if s.lastSync != nil {
		since = *s.lastSync
	}

	total, syncErr := h.collectAndStore(ctx, serverID, s, since, false)
	if syncErr != nil {
		h.finishJob(ctx, jobID, total, syncErr.Error())
		return jobID, nil
	}

	now := time.Now()

	// Auto-clean: remove boot-history entries that were incorrectly parsed as restart events.
	// These come from `last reboot` output in system_info — real timestamps are wrong (sync time, not boot time).
	_, cleanErr := h.db.Exec(ctx, `
		DELETE FROM log_events
		WHERE server_id=$1
		  AND source='system_info'
		  AND event_type='power_off'
		  AND (
			  message LIKE '%system boot%'
			OR message = '=last_reboot='
			OR message LIKE 'reboot %'
			OR message LIKE '%=uptime=%'
			OR message LIKE '%=df=%'
			OR message LIKE '%=free=%'
			OR message LIKE '%=services_failed=%'
			OR message LIKE '%=coredumps=%'
			OR (message LIKE '%Failed to make thread%' AND message LIKE '%realtime scheduled%')
			OR message LIKE '%RealtimeKit1%'
		  )`, serverID)
	if cleanErr != nil {
		log.Printf("cleanup server %d system_info noise: %v", serverID, cleanErr)
	}

	h.db.Exec(ctx, `UPDATE servers SET last_sync_at=$1 WHERE id=$2`, now, serverID)
	h.finishJob(ctx, jobID, total, "")
	return jobID, nil
}

func (h *SyncHandler) finishJob(ctx context.Context, jobID, count int, errMsg string) {
	status := "success"
	if errMsg != "" {
		status = "failed"
	}
	h.db.Exec(ctx, `
		UPDATE sync_jobs SET finished_at=NOW(), status=$1, event_count=$2, error=$3 WHERE id=$4`,
		status, count, errMsg, jobID)
}

// DeepSync triggers a sync from a specific date (for historical data recovery).
func (h *SyncHandler) DeepSync(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(chi.URLParam(r, "id"))
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}
	sinceStr := r.URL.Query().Get("since")       // e.g. "2026-06-06T00:00:00Z"
	since := time.Now().Add(-7 * 24 * time.Hour) // default 7 days
	if sinceStr != "" {
		if t, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = t
		} else if t, err := time.Parse("2006-01-02", sinceStr); err == nil {
			since = t
		}
	}
	jobID, err := h.runSyncFrom(context.Background(), id, since)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"job_id": jobID, "since": since.Format(time.RFC3339)})
}

func (h *SyncHandler) runSyncFrom(ctx context.Context, serverID int, since time.Time) (int, error) {
	var jobID int
	h.db.QueryRow(ctx, `INSERT INTO sync_jobs (server_id) VALUES ($1) RETURNING id`, serverID).Scan(&jobID)

	s, err := h.loadSyncServer(ctx, serverID, false)
	if err != nil {
		h.finishJob(ctx, jobID, 0, "server not found")
		return jobID, nil
	}

	total, syncErr := h.collectAndStore(ctx, serverID, s, since, true)
	if syncErr != nil {
		h.finishJob(ctx, jobID, total, syncErr.Error())
		return jobID, nil
	}
	// Run cleanup
	h.db.Exec(ctx, `DELETE FROM log_events WHERE server_id=$1 AND source='system_info' AND event_type='power_off' AND (message LIKE '%system boot%' OR message='=last_reboot=' OR message LIKE 'reboot %')`, serverID)
	h.db.Exec(ctx, `UPDATE servers SET last_sync_at=NOW() WHERE id=$1`, serverID)
	h.finishJob(ctx, jobID, total, "")
	return jobID, nil
}

func (h *SyncHandler) loadSyncServer(ctx context.Context, serverID int, includeLastSync bool) (syncServerRow, error) {
	var s syncServerRow
	err := h.db.QueryRow(ctx, `
		SELECT host, port, username, auth_type, COALESCE(password_enc,''), COALESCE(private_key_enc,''),
		       COALESCE(proxmox_host,''), proxmox_port, COALESCE(proxmox_username,''), proxmox_auth_type,
		       COALESCE(proxmox_password_enc,''), COALESCE(proxmox_private_key_enc,''),
		       COALESCE(vmid,''), COALESCE(app_log_paths,''), last_sync_at
		FROM servers WHERE id=$1`, serverID).
		Scan(&s.host, &s.port, &s.username, &s.authType, &s.passwordEnc, &s.keyEnc,
			&s.proxmoxHost, &s.proxmoxPort, &s.proxmoxUsername, &s.proxmoxAuthType,
			&s.proxmoxPasswordEnc, &s.proxmoxKeyEnc, &s.vmid, &s.appLogPaths, &s.lastSync)
	if err != nil {
		return s, err
	}
	if !includeLastSync {
		s.lastSync = nil
	}
	if s.proxmoxPort == 0 {
		s.proxmoxPort = 22
	}
	if s.proxmoxAuthType == "" {
		s.proxmoxAuthType = "password"
	}
	return s, nil
}

func (h *SyncHandler) collectAndStore(ctx context.Context, serverID int, s syncServerRow, since time.Time, includeProxmox bool) (int, error) {
	password, privateKey := h.decryptPair(s.passwordEnc, s.keyEnc)

	client, err := sshclient.Connect(sshclient.Config{
		Host:       s.host,
		Port:       s.port,
		Username:   s.username,
		AuthType:   s.authType,
		Password:   password,
		PrivateKey: privateKey,
	})
	if err != nil {
		h.db.Exec(ctx, `UPDATE servers SET status='error' WHERE id=$1`, serverID)
		return 0, err
	}
	defer client.Close()

	h.db.Exec(ctx, `UPDATE servers SET status='online' WHERE id=$1`, serverID)

	logMap, err := client.FetchLogs(since, s.appLogPaths)
	if err != nil {
		return 0, err
	}

	if includeProxmox {
		for _, prox := range h.proxmoxTargets(ctx, serverID, s) {
			proxPass, proxKey := h.decryptPair(prox.proxmoxPasswordEnc, prox.proxmoxKeyEnc)
			proxClient, err := sshclient.Connect(sshclient.Config{
				Host:       prox.proxmoxHost,
				Port:       prox.proxmoxPort,
				Username:   prox.proxmoxUsername,
				AuthType:   prox.proxmoxAuthType,
				Password:   proxPass,
				PrivateKey: proxKey,
			})
			if err == nil {
				for source, output := range proxClient.FetchProxmoxLogs(since, prox.vmid) {
					key := source
					if prox.proxmoxHost != "" {
						key = source + "@" + prox.proxmoxHost
					}
					logMap[key] = output
				}
				proxClient.Close()
			} else {
				logMap["proxmox_connection@"+prox.proxmoxHost] = fmt.Sprintf("%s proxmox ssh %s: %v", time.Now().UTC().Format(time.RFC3339), prox.proxmoxHost, err)
			}
		}
	}

	total := 0
	for source, output := range logMap {
		events := parser.ParseOutput(output, source, serverID)
		for _, ev := range events {
			h.db.Exec(ctx, `
				INSERT INTO log_events (server_id, timestamp, event_type, severity, message, source, raw_line)
				VALUES ($1,$2,$3,$4,$5,$6,$7)
				ON CONFLICT DO NOTHING`,
				ev.ServerID, ev.Timestamp, ev.EventType, ev.Severity, ev.Message, ev.Source, ev.RawLine)
			total++
		}
	}
	return total, nil
}

func (h *SyncHandler) proxmoxTargets(ctx context.Context, selectedServerID int, selected syncServerRow) []syncServerRow {
	if selected.proxmoxHost != "" && selected.proxmoxUsername != "" {
		return []syncServerRow{selected}
	}

	rows, err := h.db.Query(ctx, `
		SELECT host, port, username, auth_type, COALESCE(password_enc,''), COALESCE(private_key_enc,'')
		FROM servers
		WHERE id <> $1
		  AND (
			LOWER(name) LIKE '%pve%'
			OR LOWER(name) LIKE '%proxmox%'
			OR LOWER(host) LIKE '%pve%'
		  )
		ORDER BY name`, selectedServerID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var targets []syncServerRow
	for rows.Next() {
		var t syncServerRow
		if err := rows.Scan(&t.proxmoxHost, &t.proxmoxPort, &t.proxmoxUsername, &t.proxmoxAuthType, &t.proxmoxPasswordEnc, &t.proxmoxKeyEnc); err != nil {
			continue
		}
		if t.proxmoxPort == 0 {
			t.proxmoxPort = 22
		}
		if t.proxmoxAuthType == "" {
			t.proxmoxAuthType = "password"
		}
		t.vmid = selected.vmid
		targets = append(targets, t)
	}
	return targets
}

func (h *SyncHandler) decryptPair(passwordEnc, keyEnc string) (string, string) {
	var password, privateKey string
	if passwordEnc != "" {
		password, _ = decrypt(h.encryptionKey, passwordEnc)
	}
	if keyEnc != "" {
		privateKey, _ = decrypt(h.encryptionKey, keyEnc)
	}
	return password, privateKey
}

// TestConnection verifies SSH credentials without storing.
func (h *SyncHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	var req models.ServerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 22
	}

	client, err := sshclient.Connect(sshclient.Config{
		Host:       req.Host,
		Port:       req.Port,
		Username:   req.Username,
		AuthType:   req.AuthType,
		Password:   req.Password,
		PrivateKey: req.PrivateKey,
	})
	if err != nil {
		jsonOK(w, map[string]any{"success": false, "error": err.Error()})
		return
	}
	defer client.Close()

	out, _ := client.Run("uname -a")
	jsonOK(w, map[string]any{"success": true, "info": out})
}
