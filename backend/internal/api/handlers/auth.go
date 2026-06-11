package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type AuthHandler struct {
	username string
	password string
	secret   []byte
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token     string `json:"token"`
	Username  string `json:"username"`
	ExpiresAt string `json:"expires_at"`
}

func NewAuthHandler(username, password, secret string) *AuthHandler {
	if secret == "" {
		secret = "change-this-session-secret"
	}
	return &AuthHandler{username: username, password: password, secret: []byte(secret)}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid body", http.StatusBadRequest)
		return
	}

	userOK := subtle.ConstantTimeCompare([]byte(req.Username), []byte(h.username)) == 1
	passOK := subtle.ConstantTimeCompare([]byte(req.Password), []byte(h.password)) == 1
	if !userOK || !passOK {
		jsonError(w, "invalid username or password", http.StatusUnauthorized)
		return
	}

	expires := time.Now().Add(12 * time.Hour).UTC()
	token := h.sign(req.Username, expires)
	jsonOK(w, loginResponse{
		Token:     token,
		Username:  req.Username,
		ExpiresAt: expires.Format(time.RFC3339),
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	username, ok := usernameFromRequest(r)
	if !ok {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	jsonOK(w, map[string]string{"username": username})
}

func (h *AuthHandler) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			jsonError(w, "missing authorization token", http.StatusUnauthorized)
			return
		}

		username, ok := h.verify(strings.TrimPrefix(header, "Bearer "))
		if !ok {
			jsonError(w, "invalid or expired token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, withUsername(r, username))
	})
}

func (h *AuthHandler) sign(username string, expires time.Time) string {
	payload := fmt.Sprintf("%s|%d", username, expires.Unix())
	sig := hmac.New(sha256.New, h.secret)
	sig.Write([]byte(payload))
	raw := payload + "|" + base64.RawURLEncoding.EncodeToString(sig.Sum(nil))
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func (h *AuthHandler) verify(token string) (string, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return "", false
	}
	parts := strings.Split(string(raw), "|")
	if len(parts) != 3 {
		return "", false
	}

	username, expiresRaw, gotSig := parts[0], parts[1], parts[2]
	payload := username + "|" + expiresRaw
	sig := hmac.New(sha256.New, h.secret)
	sig.Write([]byte(payload))
	wantSig := base64.RawURLEncoding.EncodeToString(sig.Sum(nil))
	if subtle.ConstantTimeCompare([]byte(gotSig), []byte(wantSig)) != 1 {
		return "", false
	}

	expiresUnix, err := parseUnix(expiresRaw)
	if err != nil || time.Now().Unix() > expiresUnix {
		return "", false
	}
	return username, true
}

func parseUnix(raw string) (int64, error) {
	var out int64
	_, err := fmt.Sscanf(raw, "%d", &out)
	return out, err
}
