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

	jobID, err := h.runSync(r.Context(), id)
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
	// Load server credentials
	var s struct {
		host        string
		port        int
		username    string
		authType    string
		passwordEnc string
		keyEnc      string
		lastSync    *time.Time
	}
	err := h.db.QueryRow(ctx, `
		SELECT host, port, username, auth_type, COALESCE(password_enc,''), COALESCE(private_key_enc,''), last_sync_at
		FROM servers WHERE id=$1`, serverID).
		Scan(&s.host, &s.port, &s.username, &s.authType, &s.passwordEnc, &s.keyEnc, &s.lastSync)
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

	// Decrypt credentials
	var password, privateKey string
	if s.passwordEnc != "" {
		password, _ = decrypt(h.encryptionKey, s.passwordEnc)
	}
	if s.keyEnc != "" {
		privateKey, _ = decrypt(h.encryptionKey, s.keyEnc)
	}

	// Connect via SSH
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
		h.finishJob(ctx, jobID, 0, err.Error())
		return jobID, nil // Return job ID so caller can track it; error is in the job record
	}
	defer client.Close()

	h.db.Exec(ctx, `UPDATE servers SET status='online' WHERE id=$1`, serverID)

	// Pull logs
	logMap, err := client.FetchLogs(since)
	if err != nil {
		h.finishJob(ctx, jobID, 0, err.Error())
		return jobID, nil
	}

	// Parse and insert events
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

	now := time.Now()
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
