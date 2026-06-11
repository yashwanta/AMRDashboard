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
