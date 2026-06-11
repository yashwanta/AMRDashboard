package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type UserHandler struct {
	db *pgxpool.Pool
}

type appUser struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	Location  string    `json:"location"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type userRequest struct {
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
	Role     string `json:"role"`
	Location string `json:"location,omitempty"`
	Status   string `json:"status,omitempty"`
}

func NewUserHandler(db *pgxpool.Pool) *UserHandler {
	return &UserHandler{db: db}
}

func (h *UserHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, username, role, location, status, created_at, updated_at
		FROM app_users
		ORDER BY username`)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	users := []appUser{}
	for rows.Next() {
		var user appUser
		if err := rows.Scan(&user.ID, &user.Username, &user.Role, &user.Location, &user.Status, &user.CreatedAt, &user.UpdatedAt); err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		users = append(users, user)
	}
	jsonOK(w, users)
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Role = normalizeRole(req.Role)
	if req.Username == "" || req.Password == "" || req.Role == "" {
		jsonError(w, "username, password, and role are required", http.StatusBadRequest)
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "password hash failed", http.StatusInternalServerError)
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	var user appUser
	err = h.db.QueryRow(r.Context(), `
		INSERT INTO app_users (username, password_hash, role, location, status)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, username, role, location, status, created_at, updated_at`,
		req.Username, string(hash), req.Role, req.Location, req.Status).
		Scan(&user.ID, &user.Username, &user.Role, &user.Location, &user.Status, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, user)
}

func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var req userRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}
	req.Role = normalizeRole(req.Role)
	if req.Role == "" {
		jsonError(w, "role is required", http.StatusBadRequest)
		return
	}
	if req.Status == "" {
		req.Status = "active"
	}

	passwordHash := ""
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			jsonError(w, "password hash failed", http.StatusInternalServerError)
			return
		}
		passwordHash = string(hash)
	}

	var user appUser
	err := h.db.QueryRow(r.Context(), `
		UPDATE app_users
		SET role=$1, location=$2, status=$3,
		    password_hash=CASE WHEN $4='' THEN password_hash ELSE $4 END,
		    updated_at=NOW()
		WHERE id=$5
		RETURNING id, username, role, location, status, created_at, updated_at`,
		req.Role, req.Location, req.Status, passwordHash, id).
		Scan(&user.ID, &user.Username, &user.Role, &user.Location, &user.Status, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	jsonOK(w, user)
}

func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	_, err := h.db.Exec(r.Context(), `DELETE FROM app_users WHERE id=$1`, id)
	if err != nil {
		jsonError(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func normalizeRole(role string) string {
	switch strings.TrimSpace(role) {
	case "Super Admin", "Global Admin", "Global Admin Read Only", "Location Admin", "IT User":
		return strings.TrimSpace(role)
	default:
		return ""
	}
}
