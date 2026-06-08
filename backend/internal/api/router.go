package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/cors"
	"github.com/yashwanta/AMRDashboard/internal/api/handlers"
)

func NewRouter(db *pgxpool.Pool, encryptionKey string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)

	serverH := handlers.NewServerHandler(db, encryptionKey)
	logH := handlers.NewLogHandler(db)
	syncH := handlers.NewSyncHandler(db, encryptionKey)

	r.Route("/api", func(r chi.Router) {
		// Servers
		r.Get("/servers", serverH.List)
		r.Post("/servers", serverH.Create)
		r.Put("/servers/{id}", serverH.Update)
		r.Delete("/servers/{id}", serverH.Delete)

		// Sync
		r.Post("/servers/{id}/sync", syncH.SyncServer)
		r.Post("/servers/{id}/deep-sync", syncH.DeepSync)
		r.Post("/sync/all", syncH.SyncAll)
		r.Post("/sync/test", syncH.TestConnection)

		// Logs & stats
		r.Get("/logs", logH.List)
		r.Get("/stats", logH.Stats)
		r.Get("/timeline", logH.Timeline)
		r.Get("/incidents/summary", logH.IncidentSummary)
		r.Get("/sync-history", logH.SyncHistory)
		r.Get("/server-stats", logH.ServerStats)
	})

	corsH := cors.New(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: false,
	})

	return corsH.Handler(r)
}
