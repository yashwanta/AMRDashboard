package handlers

import (
	"net/http"
	"strconv"

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
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='power_off'`).Scan(&stats.PowerOffCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='error'`).Scan(&stats.ErrorCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='robot_offline'`).Scan(&stats.RobotOfflineCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='robot_online'`).Scan(&stats.RobotOnlineCount)
	h.db.QueryRow(ctx, `SELECT COUNT(*) FROM log_events WHERE event_type='disk_error'`).Scan(&stats.DiskErrorCount)

	jsonOK(w, stats)
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
