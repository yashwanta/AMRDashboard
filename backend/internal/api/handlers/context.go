package handlers

import (
	"context"
	"net/http"
)

type contextKey string

const usernameContextKey contextKey = "username"

func withUsername(r *http.Request, username string) *http.Request {
	ctx := context.WithValue(r.Context(), usernameContextKey, username)
	return r.WithContext(ctx)
}

func usernameFromRequest(r *http.Request) (string, bool) {
	username, ok := r.Context().Value(usernameContextKey).(string)
	return username, ok && username != ""
}
