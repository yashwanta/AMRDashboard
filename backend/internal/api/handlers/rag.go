package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/yashwanta/AMRDashboard/internal/models"
)

type RAGHandler struct {
	db *pgxpool.Pool
}

type ragQueryRequest struct {
	Question string `json:"question"`
}

type ragSourceEvent struct {
	ID                int64     `json:"id"`
	ServerName        string    `json:"server_name"`
	Timestamp         time.Time `json:"timestamp"`
	EventType         string    `json:"event_type"`
	Severity          string    `json:"severity"`
	Message           string    `json:"message"`
	Source            string    `json:"source"`
	RawLine           string    `json:"raw_line,omitempty"`
	PlainEnglish      string    `json:"plain_english,omitempty"`
	RecommendedAction string    `json:"recommended_action,omitempty"`
}

type ragQueryResponse struct {
	Answer       string           `json:"answer"`
	Model        string           `json:"model"`
	SourceEvents []ragSourceEvent `json:"source_events"`
}

type ragHistoryItem struct {
	ID        int64     `json:"id"`
	Question  string    `json:"question"`
	Answer    string    `json:"answer"`
	Model     string    `json:"model"`
	CreatedAt time.Time `json:"created_at"`
}

func NewRAGHandler(db *pgxpool.Pool) *RAGHandler {
	return &RAGHandler{db: db}
}

func (h *RAGHandler) Query(w http.ResponseWriter, r *http.Request) {
	var req ragQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	question := strings.TrimSpace(req.Question)
	if question == "" {
		jsonError(w, "question is required", http.StatusBadRequest)
		return
	}

	if isPatchInventoryQuestion(question) {
		h.answerPatchInventory(w, r, question)
		return
	}

	events, err := h.searchEvents(r, question)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	answer := buildSiteOpsAnswer(question, events)
	contextIDs := make([]string, 0, len(events))
	for _, ev := range events {
		contextIDs = append(contextIDs, strconv.FormatInt(ev.ID, 10))
	}
	username, _ := usernameFromRequest(r)
	_, _ = h.db.Exec(r.Context(), `
		INSERT INTO rag_history (username, question, answer, context_ids, model)
		VALUES ($1,$2,$3,$4,$5)`,
		username, question, answer, strings.Join(contextIDs, ","), "siteops-log-search")

	jsonOK(w, ragQueryResponse{
		Answer:       answer,
		Model:        "siteops-log-search",
		SourceEvents: events,
	})
}

type patchRunSummary struct {
	ServerName string
	Action     string
	Status     string
	Output     string
	Error      string
	CreatedAt  time.Time
}

func (h *RAGHandler) answerPatchInventory(w http.ResponseWriter, r *http.Request, question string) {
	rows, err := h.db.Query(r.Context(), `
		SELECT DISTINCT ON (ar.server_id)
			s.name, ar.action, ar.status, ar.output, ar.error, ar.created_at
		FROM action_runs ar
		JOIN servers s ON s.id = ar.server_id
		WHERE ar.action IN ('package_list_upgrades', 'package_upgrade_dry_run', 'package_update_cache', 'package_upgrade')
		ORDER BY ar.server_id, ar.created_at DESC`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	runs := []patchRunSummary{}
	for rows.Next() {
		var run patchRunSummary
		if err := rows.Scan(&run.ServerName, &run.Action, &run.Status, &run.Output, &run.Error, &run.CreatedAt); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		runs = append(runs, run)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	answer := buildPatchInventoryAnswer(runs)
	username, _ := usernameFromRequest(r)
	_, _ = h.db.Exec(r.Context(), `
		INSERT INTO rag_history (username, question, answer, context_ids, model)
		VALUES ($1,$2,$3,$4,$5)`,
		username, question, answer, "", "siteops-patch-inventory")

	jsonOK(w, ragQueryResponse{
		Answer:       answer,
		Model:        "siteops-patch-inventory",
		SourceEvents: []ragSourceEvent{},
	})
}

func (h *RAGHandler) History(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, question, answer, model, created_at
		FROM rag_history
		ORDER BY created_at DESC
		LIMIT 25`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []ragHistoryItem{}
	for rows.Next() {
		var item ragHistoryItem
		if err := rows.Scan(&item.ID, &item.Question, &item.Answer, &item.Model, &item.CreatedAt); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		items = append(items, item)
	}
	jsonOK(w, items)
}

func (h *RAGHandler) searchEvents(r *http.Request, question string) ([]ragSourceEvent, error) {
	terms := meaningfulTerms(question)
	where := "WHERE le.timestamp > NOW() - INTERVAL '30 days'"
	args := []any{}
	argN := 1
	if len(terms) > 0 {
		clauses := []string{}
		for _, term := range terms {
			clauses = append(clauses, "(le.message ILIKE $"+strconv.Itoa(argN)+" OR le.raw_line ILIKE $"+strconv.Itoa(argN)+" OR le.event_type ILIKE $"+strconv.Itoa(argN)+" OR s.name ILIKE $"+strconv.Itoa(argN)+")")
			args = append(args, "%"+term+"%")
			argN++
		}
		where += " AND (" + strings.Join(clauses, " OR ") + ")"
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT le.id, s.name, le.timestamp, le.event_type, le.severity, le.message, le.source, COALESCE(le.raw_line,'')
		FROM log_events le
		JOIN servers s ON s.id = le.server_id
		`+where+`
		ORDER BY
			CASE le.severity
				WHEN 'critical' THEN 1
				WHEN 'high' THEN 2
				WHEN 'medium' THEN 3
				ELSE 4
			END,
			le.timestamp DESC
		LIMIT 10`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	events := []ragSourceEvent{}
	for rows.Next() {
		var ev ragSourceEvent
		if err := rows.Scan(&ev.ID, &ev.ServerName, &ev.Timestamp, &ev.EventType, &ev.Severity, &ev.Message, &ev.Source, &ev.RawLine); err != nil {
			return nil, err
		}
		logEvent := models.LogEvent{
			ID:         ev.ID,
			ServerName: ev.ServerName,
			Timestamp:  ev.Timestamp,
			EventType:  ev.EventType,
			Severity:   ev.Severity,
			Message:    ev.Message,
			Source:     ev.Source,
			RawLine:    ev.RawLine,
		}
		ev.PlainEnglish = PlainEnglishLog(logEvent)
		ev.RecommendedAction = RecommendedAction(logEvent)
		events = append(events, ev)
	}
	return events, nil
}

func meaningfulTerms(question string) []string {
	stop := map[string]bool{
		"the": true, "and": true, "for": true, "with": true, "what": true, "why": true,
		"did": true, "does": true, "were": true, "was": true, "from": true, "this": true,
		"that": true, "show": true, "tell": true, "about": true, "there": true, "have": true,
	}
	parts := strings.FieldsFunc(strings.ToLower(question), func(r rune) bool {
		return (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '.'
	})
	seen := map[string]bool{}
	terms := []string{}
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if len(part) < 3 || stop[part] || seen[part] {
			continue
		}
		seen[part] = true
		terms = append(terms, part)
		if len(terms) == 6 {
			break
		}
	}
	return terms
}

func isPatchInventoryQuestion(question string) bool {
	q := strings.ToLower(question)
	patchWords := []string{"patch", "patching", "update", "updates", "upgrade", "upgrades", "security update", "missing"}
	for _, word := range patchWords {
		if strings.Contains(q, word) {
			return strings.Contains(q, "server") ||
				strings.Contains(q, "endpoint") ||
				strings.Contains(q, "missing") ||
				strings.Contains(q, "available") ||
				strings.Contains(q, "need") ||
				strings.Contains(q, "pending")
		}
	}
	return false
}

func buildPatchInventoryAnswer(runs []patchRunSummary) string {
	if len(runs) == 0 {
		return "I do not have patch inventory yet. Run OpsForge > List available upgrades or Preview upgrade for the endpoints you want to check, then ask this question again. I will not guess from unrelated application logs."
	}

	missing := []string{}
	clean := []string{}
	failed := []string{}
	unknown := []string{}
	latest := runs[0].CreatedAt
	for _, run := range runs {
		if run.CreatedAt.After(latest) {
			latest = run.CreatedAt
		}
		switch classifyPatchRun(run) {
		case "missing":
			missing = append(missing, run.ServerName)
		case "clean":
			clean = append(clean, run.ServerName)
		case "failed":
			failed = append(failed, run.ServerName)
		default:
			unknown = append(unknown, run.ServerName)
		}
	}

	parts := []string{fmt.Sprintf("Based on OpsForge patch checks, I found patch inventory for %d server(s). Latest check: %s.", len(runs), latest.Format("Jan 2, 2006 3:04 PM"))}
	if len(missing) > 0 {
		parts = append(parts, "Likely missing patches: "+strings.Join(missing, ", ")+".")
	}
	if len(clean) > 0 {
		parts = append(parts, "No available upgrades detected: "+strings.Join(clean, ", ")+".")
	}
	if len(failed) > 0 {
		parts = append(parts, "Patch check failed or could not complete: "+strings.Join(failed, ", ")+".")
	}
	if len(unknown) > 0 {
		parts = append(parts, "Patch status needs review because the command output was inconclusive: "+strings.Join(unknown, ", ")+".")
	}
	parts = append(parts, "Use OpsForge > List available upgrades or Preview upgrade to refresh this inventory before making changes.")
	return strings.Join(parts, " ")
}

func classifyPatchRun(run patchRunSummary) string {
	if run.Status != "success" {
		return "failed"
	}
	text := strings.ToLower(run.Output + "\n" + run.Error)
	noUpgradeSignals := []string{
		"0 upgraded",
		"nothing to do",
		"no packages marked for update",
		"no packages needed for security",
		"no packages marked for upgrade",
	}
	for _, signal := range noUpgradeSignals {
		if strings.Contains(text, signal) {
			return "clean"
		}
	}
	if strings.TrimSpace(run.Output) == "" {
		return "unknown"
	}
	upgradeSignals := []string{"upgradable", "upgrades", "upgrade", "security", "updates", ".x86_64", ".noarch", ".el", "/"}
	for _, signal := range upgradeSignals {
		if strings.Contains(text, signal) {
			if run.Action == "package_update_cache" {
				return "unknown"
			}
			return "missing"
		}
	}
	return "unknown"
}

func buildSiteOpsAnswer(question string, events []ragSourceEvent) string {
	if len(events) == 0 {
		return "I don't have enough log data to answer that from the current SiteOps event database."
	}

	counts := map[string]int{}
	critical := 0
	for _, ev := range events {
		counts[ev.EventType]++
		if ev.Severity == "critical" || ev.Severity == "high" {
			critical++
		}
	}

	topType, topCount := "", 0
	for eventType, count := range counts {
		if count > topCount {
			topType, topCount = eventType, count
		}
	}

	first := events[0]
	evidence := first.PlainEnglish
	if evidence == "" {
		evidence = first.Message
	}
	return fmt.Sprintf(
		"Based on the current SiteOps logs, I found %d relevant events for your question. The strongest signal is %s (%d event(s)). %d event(s) are high or critical. Most recent matching evidence is from %s on %s: %s",
		len(events),
		strings.ReplaceAll(topType, "_", " "),
		topCount,
		critical,
		first.ServerName,
		first.Timestamp.Format("Jan 2, 2006 3:04 PM"),
		evidence,
	)
}
